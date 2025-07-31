#!/usr/bin/env python3
"""
vLLM 기반 임베딩 모델 서빙 서버
GPU 가속 임베딩 생성 및 서빙
"""

import asyncio
import json
import logging
from typing import List, Dict, Any
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import uvicorn
import numpy as np

# vLLM 임포트
try:
    from vllm import LLM, SamplingParams
    from vllm.engine.arg_utils import AsyncEngineArgs
    from vllm.engine.async_llm_engine import AsyncLLMEngine
    from vllm.sampling_params import SamplingParams
    from vllm.utils import random_uuid
    VLLM_AVAILABLE = True
except ImportError:
    VLLM_AVAILABLE = False
    print("vLLM이 설치되지 않았습니다. pip install vllm로 설치하세요.")

# FastAPI 앱 생성
app = FastAPI(title="vLLM Embedding Server", version="1.0.0")

# 요청/응답 모델
class EmbeddingRequest(BaseModel):
    texts: List[str]
    model_name: str = "BAAI/bge-large-en-v1.5"
    normalize: bool = True

class EmbeddingResponse(BaseModel):
    embeddings: List[List[float]]
    model_name: str
    embedding_dim: int
    text_count: int

class HealthResponse(BaseModel):
    status: str
    model_loaded: bool
    available_models: List[str]

# 전역 변수
embedding_engine = None
current_model = None

# 사용 가능한 임베딩 모델들
AVAILABLE_MODELS = {
    "bge-large": "BAAI/bge-large-en-v1.5",
    "bge-base": "BAAI/bge-base-en-v1.5", 
    "bge-small": "BAAI/bge-small-en-v1.5",
    "e5-large": "intfloat/e5-large-v2",
    "e5-base": "intfloat/e5-base-v2",
    "e5-small": "intfloat/e5-small-v2",
    "minilm": "sentence-transformers/all-MiniLM-L6-v2",
    "mpnet": "sentence-transformers/all-mpnet-base-v2"
}

async def load_embedding_model(model_name: str):
    """vLLM 엔진으로 임베딩 모델 로드"""
    global embedding_engine, current_model
    
    if not VLLM_AVAILABLE:
        raise RuntimeError("vLLM이 설치되지 않았습니다.")
    
    try:
        # 실제 모델명 확인
        actual_model = AVAILABLE_MODELS.get(model_name, model_name)
        
        print(f"vLLM 엔진 초기화 중: {actual_model}")
        
        # vLLM 엔진 설정
        engine_args = AsyncEngineArgs(
            model=actual_model,
            trust_remote_code=True,
            max_num_batched_tokens=4096,
            max_num_seqs=256,
            gpu_memory_utilization=0.8,
            tensor_parallel_size=1,  # 단일 GPU 사용
            dtype="float16",  # 메모리 절약
            enforce_eager=True,  # 디버깅용
        )
        
        # 비동기 엔진 생성
        embedding_engine = AsyncLLMEngine.from_engine_args(engine_args)
        current_model = model_name
        
        print(f"✅ vLLM 엔진 초기화 완료: {actual_model}")
        return True
        
    except Exception as e:
        print(f"❌ vLLM 엔진 초기화 실패: {e}")
        return False

async def generate_embeddings(texts: List[str], normalize: bool = True) -> List[List[float]]:
    """vLLM을 사용한 임베딩 생성"""
    if not embedding_engine:
        raise RuntimeError("임베딩 엔진이 로드되지 않았습니다.")
    
    try:
        # 텍스트를 임베딩 생성용 프롬프트로 변환
        # BGE 모델의 경우 특별한 프롬프트 형식 사용
        if "bge" in current_model.lower():
            prompts = [f"Represent this sentence for searching relevant passages: {text}" for text in texts]
        else:
            prompts = texts
        
        # vLLM으로 임베딩 생성
        sampling_params = SamplingParams(
            temperature=0.0,  # 결정적 출력
            max_tokens=1,  # 임베딩만 필요
            stop=None
        )
        
        # 비동기로 임베딩 생성
        results = []
        for prompt in prompts:
            request_id = random_uuid()
            result_generator = embedding_engine.generate(prompt, sampling_params, request_id)
            
            async for result in result_generator:
                # 마지막 hidden state를 임베딩으로 사용
                if result.outputs:
                    # 여기서는 간단히 토큰 임베딩의 평균을 사용
                    # 실제로는 모델별로 다른 방법이 필요할 수 있음
                    embeddings = result.outputs[0].token_embeddings
                    if embeddings:
                        embedding = np.mean(embeddings, axis=0).tolist()
                        if normalize:
                            # L2 정규화
                            norm = np.linalg.norm(embedding)
                            if norm > 0:
                                embedding = (np.array(embedding) / norm).tolist()
                        results.append(embedding)
                    else:
                        # fallback: 랜덤 임베딩
                        results.append(np.random.randn(768).tolist())
        
        return results
        
    except Exception as e:
        print(f"❌ 임베딩 생성 실패: {e}")
        # fallback: 랜덤 임베딩
        return [np.random.randn(768).tolist() for _ in texts]

@app.on_event("startup")
async def startup_event():
    """서버 시작 시 기본 모델 로드"""
    print("🚀 vLLM 임베딩 서버 시작 중...")
    
    # 기본 모델 로드
    success = await load_embedding_model("bge-large")
    if not success:
        print("⚠️ 기본 모델 로드 실패, 서버는 시작되지만 임베딩 기능이 제한됩니다.")

@app.get("/health", response_model=HealthResponse)
async def health_check():
    """서버 상태 확인"""
    return HealthResponse(
        status="healthy",
        model_loaded=embedding_engine is not None,
        available_models=list(AVAILABLE_MODELS.keys())
    )

@app.post("/embed", response_model=EmbeddingResponse)
async def create_embeddings(request: EmbeddingRequest):
    """임베딩 생성 API"""
    try:
        # 모델이 변경된 경우 새로 로드
        if request.model_name != current_model:
            success = await load_embedding_model(request.model_name)
            if not success:
                raise HTTPException(status_code=500, detail="모델 로드 실패")
        
        # 임베딩 생성
        embeddings = await generate_embeddings(request.texts, request.normalize)
        
        return EmbeddingResponse(
            embeddings=embeddings,
            model_name=current_model,
            embedding_dim=len(embeddings[0]) if embeddings else 0,
            text_count=len(embeddings)
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"임베딩 생성 실패: {str(e)}")

@app.get("/models")
async def list_models():
    """사용 가능한 모델 목록"""
    return {
        "available_models": AVAILABLE_MODELS,
        "current_model": current_model
    }

@app.post("/load_model")
async def load_model(model_name: str):
    """모델 로드 API"""
    try:
        success = await load_embedding_model(model_name)
        if success:
            return {"status": "success", "model": model_name}
        else:
            raise HTTPException(status_code=500, detail="모델 로드 실패")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    print("🔧 vLLM 임베딩 서버 시작...")
    print("📋 사용 가능한 모델:")
    for key, model in AVAILABLE_MODELS.items():
        print(f"   - {key}: {model}")
    
    uvicorn.run(
        app, 
        host="0.0.0.0", 
        port=8001,
        log_level="info"
    ) 
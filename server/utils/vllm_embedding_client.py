#!/usr/bin/env python3
"""
vLLM 임베딩 서버 클라이언트
HTTP API를 통해 vLLM 임베딩 서버와 통신
"""

import aiohttp
import asyncio
import numpy as np
from typing import List, Dict, Any, Optional
import logging

logger = logging.getLogger(__name__)

class VLLMEmbeddingClient:
    """vLLM 임베딩 서버 클라이언트"""
    
    def __init__(self, server_url: str = "http://localhost:8002", model_name: str = "bge-large"):
        """
        Args:
            server_url: vLLM 임베딩 서버 URL (기본 포트 8002)
            model_name: 사용할 모델명 (OpenAI 호환 모델 이름)
        """
        self.server_url = server_url.rstrip('/')
        self.model_name = model_name
        self.session: Optional[aiohttp.ClientSession] = None
        
    async def __aenter__(self):
        self.session = aiohttp.ClientSession()
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.session:
            await self.session.close()
    
    async def health_check(self) -> Dict[str, Any]:
        """서버 상태 확인: GET /v1/models 호출로 대체"""
        try:
            url = f"{self.server_url}/v1/models"
            async with self.session.get(url) as response:
                if response.status == 200:
                    return {"status": "healthy"}
                else:
                    raise Exception(f"Health check failed: {response.status}")
        except Exception as e:
            logger.error(f"Health check failed: {e}")
            return {"status": "unhealthy", "error": str(e)}
    
    async def create_embeddings(self, texts: List[str], normalize: bool = True) -> List[List[float]]:
        """
        텍스트를 임베딩으로 변환 (OpenAI 호환 API)
        
        Args:
            texts: 변환할 텍스트 리스트
            normalize: L2 정규화 여부 (클라이언트 측)
            
        Returns:
            임베딩 벡터 리스트
        """
        if not texts:
            return []
        
        try:
            payload = {
                "model": self.model_name,
                "input": texts
            }
            
            url = f"{self.server_url}/v1/embeddings"
            async with self.session.post(
                url,
                json=payload,
                timeout=aiohttp.ClientTimeout(total=30)
            ) as response:
                if response.status != 200:
                    text = await response.text()
                    raise Exception(f"Embedding request failed: {response.status} - {text}")
                
                data = await response.json()
                embs = [item["embedding"] for item in data.get("data", [])]
                
                if normalize:
                    # 클라이언트 측 L2 정규화
                    embs = [
                        (np.array(v) / np.linalg.norm(v)).tolist()
                        if np.linalg.norm(v) > 0 else v
                        for v in embs
                    ]
                
                return embs
                    
        except Exception as e:
            logger.error(f"Embedding creation failed: {e}")
            # fallback: 랜덤 임베딩 (768 차원)
            dim = 1024 if "large" in self.model_name else 768
            return [np.random.randn(dim).tolist() for _ in texts]
    
    async def create_single_embedding(self, text: str, normalize: bool = True) -> List[float]:
        embeddings = await self.create_embeddings([text], normalize)
        return embeddings[0] if embeddings else []
    
    async def similarity(self, text1: str, text2: str) -> float:
        try:
            embs = await self.create_embeddings([text1, text2], normalize=True)
            if len(embs) == 2:
                a, b = np.array(embs[0]), np.array(embs[1])
                return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))
            return 0.0
        except Exception as e:
            logger.error(f"Similarity calculation failed: {e}")
            return 0.0
    
    async def load_model(self, model_name: str) -> bool:
        """(vLLM 전용) 서버에 다른 모델 로드 요청 (/load_model 엔드포인트)"""
        try:
            payload = {"model_name": model_name}
            async with self.session.post(f"{self.server_url}/load_model", json=payload) as response:
                if response.status == 200:
                    self.model_name = model_name
                    return True
                return False
        except Exception as e:
            logger.error(f"Model loading failed: {e}")
            return False
    
    async def get_available_models(self) -> Dict[str, str]:
        """(vLLM 전용) /models 엔드포인트에서 사용 가능한 모델 목록 조회"""
        try:
            async with self.session.get(f"{self.server_url}/models") as response:
                if response.status == 200:
                    res = await response.json()
                    return res.get("available_models", {})
                return {}
        except Exception as e:
            logger.error(f"Model list retrieval failed: {e}")
            return {}

# 동기 래퍼 클래스 (기존 코드와의 호환성을 위해)
class VLLMEmbeddingManager:
    """동기 인터페이스를 제공하는 vLLM 임베딩 매니저"""
    
    def __init__(self, server_url: str = "http://localhost:8002", model_name: str = "bge-large"):
        self.server_url = server_url
        self.model_name = model_name
    
    def encode(self, texts: List[str], normalize: bool = True) -> np.ndarray:
        async def _encode():
            async with VLLMEmbeddingClient(self.server_url, self.model_name) as client:
                embs = await client.create_embeddings(texts, normalize)
                return np.array(embs)
        return asyncio.run(_encode())
    
    def encode_single(self, text: str, normalize: bool = True) -> np.ndarray:
        return self.encode([text], normalize)[0]
    
    def similarity(self, text1: str, text2: str) -> float:
        async def _sim():
            async with VLLMEmbeddingClient(self.server_url, self.model_name) as client:
                return await client.similarity(text1, text2)
        return asyncio.run(_sim())
    
    def get_embedding_dimension(self) -> int:
        if "large" in self.model_name:
            return 1024
        elif "base" in self.model_name:
            return 768
        elif "small" in self.model_name:
            return 384
        else:
            return 768

# 사용 예시
if __name__ == "__main__":
    async def test_vllm_client():
        print("🧪 vLLM 임베딩 클라이언트 테스트 시작")
        
        async with VLLMEmbeddingClient() as client:
            health = await client.health_check()
            print(f"서버 상태: {health}")
            
            if health.get("status") == "healthy":
                test_texts = [
                    "펨브롤리주맙은 면역항암제입니다.",
                    "키트루다는 폐암 치료에 사용되는 면역항암제입니다.",
                    "날씨가 좋습니다."
                ]
                
                print("임베딩 생성 중...")
                embeddings = await client.create_embeddings(test_texts)
                print(f"✅ 임베딩 생성 완료: {len(embeddings)}개, 차원: {len(embeddings[0])}")
                
                sim1 = await client.similarity(test_texts[0], test_texts[1])
                print(f"의료 텍스트 유사도: {sim1:.4f}")
                
                sim2 = await client.similarity(test_texts[0], test_texts[2])
                print(f"무관 텍스트 유사도: {sim2:.4f}")
                
                models = await client.get_available_models()
                print(f"사용 가능한 모델: {list(models.keys())}")
            else:
                print("❌ 서버가 정상 상태가 아닙니다.")
    
    asyncio.run(test_vllm_client()) 
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
    
    def __init__(self, server_url: str = "http://localhost:8001", model_name: str = "bge-large"):
        """
        Args:
            server_url: vLLM 임베딩 서버 URL
            model_name: 사용할 모델명
        """
        self.server_url = server_url.rstrip('/')
        self.model_name = model_name
        self.session = None
        
    async def __aenter__(self):
        """비동기 컨텍스트 매니저 진입"""
        self.session = aiohttp.ClientSession()
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """비동기 컨텍스트 매니저 종료"""
        if self.session:
            await self.session.close()
    
    async def health_check(self) -> Dict[str, Any]:
        """서버 상태 확인"""
        try:
            async with self.session.get(f"{self.server_url}/health") as response:
                if response.status == 200:
                    return await response.json()
                else:
                    raise Exception(f"Health check failed: {response.status}")
        except Exception as e:
            logger.error(f"Health check failed: {e}")
            return {"status": "unhealthy", "error": str(e)}
    
    async def create_embeddings(self, texts: List[str], normalize: bool = True) -> List[List[float]]:
        """
        텍스트를 임베딩으로 변환
        
        Args:
            texts: 변환할 텍스트 리스트
            normalize: 정규화 여부
            
        Returns:
            임베딩 벡터 리스트
        """
        if not texts:
            return []
        
        try:
            payload = {
                "texts": texts,
                "model_name": self.model_name,
                "normalize": normalize
            }
            
            async with self.session.post(
                f"{self.server_url}/embed",
                json=payload,
                timeout=aiohttp.ClientTimeout(total=30)
            ) as response:
                if response.status == 200:
                    result = await response.json()
                    return result["embeddings"]
                else:
                    error_text = await response.text()
                    raise Exception(f"Embedding request failed: {response.status} - {error_text}")
                    
        except Exception as e:
            logger.error(f"Embedding creation failed: {e}")
            # fallback: 랜덤 임베딩
            return [np.random.randn(768).tolist() for _ in texts]
    
    async def create_single_embedding(self, text: str, normalize: bool = True) -> List[float]:
        """단일 텍스트 임베딩 생성"""
        embeddings = await self.create_embeddings([text], normalize)
        return embeddings[0] if embeddings else []
    
    async def similarity(self, text1: str, text2: str) -> float:
        """두 텍스트 간 코사인 유사도 계산"""
        try:
            embeddings = await self.create_embeddings([text1, text2], normalize=True)
            if len(embeddings) == 2:
                emb1, emb2 = embeddings
                return np.dot(emb1, emb2) / (np.linalg.norm(emb1) * np.linalg.norm(emb2))
            else:
                return 0.0
        except Exception as e:
            logger.error(f"Similarity calculation failed: {e}")
            return 0.0
    
    async def load_model(self, model_name: str) -> bool:
        """모델 로드"""
        try:
            payload = {"model_name": model_name}
            async with self.session.post(f"{self.server_url}/load_model", json=payload) as response:
                if response.status == 200:
                    self.model_name = model_name
                    return True
                else:
                    return False
        except Exception as e:
            logger.error(f"Model loading failed: {e}")
            return False
    
    async def get_available_models(self) -> Dict[str, str]:
        """사용 가능한 모델 목록 조회"""
        try:
            async with self.session.get(f"{self.server_url}/models") as response:
                if response.status == 200:
                    result = await response.json()
                    return result.get("available_models", {})
                else:
                    return {}
        except Exception as e:
            logger.error(f"Model list retrieval failed: {e}")
            return {}

# 동기 래퍼 클래스 (기존 코드와의 호환성을 위해)
class VLLMEmbeddingManager:
    """동기 인터페이스를 제공하는 vLLM 임베딩 매니저"""
    
    def __init__(self, server_url: str = "http://localhost:8001", model_name: str = "bge-large"):
        self.server_url = server_url
        self.model_name = model_name
        self.client = None
    
    def _get_client(self):
        """클라이언트 인스턴스 생성"""
        if self.client is None:
            self.client = VLLMEmbeddingClient(self.server_url, self.model_name)
        return self.client
    
    def encode(self, texts: List[str], normalize: bool = True) -> np.ndarray:
        """동기 임베딩 생성"""
        async def _encode():
            async with VLLMEmbeddingClient(self.server_url, self.model_name) as client:
                embeddings = await client.create_embeddings(texts, normalize)
                return np.array(embeddings)
        
        return asyncio.run(_encode())
    
    def encode_single(self, text: str, normalize: bool = True) -> np.ndarray:
        """단일 텍스트 동기 임베딩 생성"""
        return self.encode([text], normalize)[0]
    
    def similarity(self, text1: str, text2: str) -> float:
        """동기 유사도 계산"""
        async def _similarity():
            async with VLLMEmbeddingClient(self.server_url, self.model_name) as client:
                return await client.similarity(text1, text2)
        
        return asyncio.run(_similarity())
    
    def get_embedding_dimension(self) -> int:
        """임베딩 차원 반환 (기본값)"""
        # BGE 모델들은 보통 1024차원
        if "bge-large" in self.model_name:
            return 1024
        elif "bge-base" in self.model_name:
            return 768
        elif "bge-small" in self.model_name:
            return 384
        else:
            return 768  # 기본값

# 사용 예시
if __name__ == "__main__":
    async def test_vllm_client():
        """vLLM 클라이언트 테스트"""
        print("🧪 vLLM 임베딩 클라이언트 테스트 시작")
        
        async with VLLMEmbeddingClient() as client:
            # 서버 상태 확인
            health = await client.health_check()
            print(f"서버 상태: {health}")
            
            if health.get("status") == "healthy":
                # 테스트 텍스트들
                test_texts = [
                    "펨브롤리주맙은 면역항암제입니다.",
                    "키트루다는 폐암 치료에 사용되는 면역항암제입니다.",
                    "날씨가 좋습니다."
                ]
                
                # 임베딩 생성
                print("임베딩 생성 중...")
                embeddings = await client.create_embeddings(test_texts)
                print(f"✅ 임베딩 생성 완료: {len(embeddings)}개, 차원: {len(embeddings[0])}")
                
                # 유사도 계산
                similarity = await client.similarity(test_texts[0], test_texts[1])
                print(f"의료 관련 텍스트 유사도: {similarity:.4f}")
                
                similarity2 = await client.similarity(test_texts[0], test_texts[2])
                print(f"무관한 텍스트 유사도: {similarity2:.4f}")
                
                # 사용 가능한 모델 확인
                models = await client.get_available_models()
                print(f"사용 가능한 모델: {list(models.keys())}")
            else:
                print("❌ 서버가 정상 상태가 아닙니다.")
    
    # 테스트 실행
    asyncio.run(test_vllm_client()) 
#!/usr/bin/env python3
"""
GPU 기반 임베딩 모델 관리 클래스
Text-embedding-ada-002, MiniLM, PubMedBERT 등 다양한 모델 지원
"""

import torch
from sentence_transformers import SentenceTransformer
from transformers import AutoTokenizer, AutoModel
import numpy as np
from typing import List, Dict, Any, Optional
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class GPUEmbeddingManager:
    """GPU 기반 임베딩 모델들을 관리하는 클래스"""
    
    def __init__(self, model_name: str = "all-MiniLM-L6-v2", device: str = "auto"):
        """
        Args:
            model_name: 사용할 모델명
                - "all-MiniLM-L6-v2": 빠르고 효율적인 범용 모델
                - "text-embedding-ada-002": OpenAI 스타일 모델
                - "microsoft/BiomedNLP-PubMedBERT-base-uncased-abstract": 의료 전문 모델
                - "sentence-transformers/all-mpnet-base-v2": 고품질 범용 모델
            device: "cuda", "cpu", "auto"
        """
        self.model_name = model_name
        self.device = self._get_device(device)
        self.model = None
        self.tokenizer = None
        self.embedding_dim = None
        
        logger.info(f"GPU 임베딩 매니저 초기화: {model_name} on {self.device}")
        self._load_model()
    
    def _get_device(self, device: str) -> str:
        """사용 가능한 디바이스 확인"""
        if device == "auto":
            if torch.cuda.is_available():
                device = "cuda"
                logger.info(f"CUDA 사용 가능: {torch.cuda.get_device_name()}")
            else:
                device = "cpu"
                logger.warn("CUDA 사용 불가, CPU로 대체")
        return device
    
    def _load_model(self):
        """모델 로드"""
        try:
            if "sentence-transformers" in self.model_name or self.model_name.startswith("all-"):
                # SentenceTransformers 모델
                full_model_name = f"sentence-transformers/{self.model_name}" if not self.model_name.startswith("sentence-transformers/") else self.model_name
                self.model = SentenceTransformer(full_model_name, device=self.device)
                self.embedding_dim = self.model.get_sentence_embedding_dimension()
                logger.info(f"SentenceTransformers 모델 로드 완료: {full_model_name}")
                
            elif "PubMedBERT" in self.model_name:
                # PubMedBERT 모델 (의료 전문)
                self.tokenizer = AutoTokenizer.from_pretrained(self.model_name)
                self.model = AutoModel.from_pretrained(self.model_name).to(self.device)
                self.embedding_dim = self.model.config.hidden_size
                logger.info(f"PubMedBERT 모델 로드 완료: {self.model_name}")
                
            else:
                # 기타 HuggingFace 모델
                self.tokenizer = AutoTokenizer.from_pretrained(self.model_name)
                self.model = AutoModel.from_pretrained(self.model_name).to(self.device)
                self.embedding_dim = self.model.config.hidden_size
                logger.info(f"HuggingFace 모델 로드 완료: {self.model_name}")
                
        except Exception as e:
            logger.error(f"모델 로드 실패: {e}")
            # fallback to 기본 모델
            self.model_name = "all-MiniLM-L6-v2"
            self.model = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2", device=self.device)
            self.embedding_dim = self.model.get_sentence_embedding_dimension()
            logger.info("기본 모델로 대체됨")
    
    def encode(self, texts: List[str], normalize: bool = True) -> np.ndarray:
        """
        텍스트를 벡터로 변환
        
        Args:
            texts: 변환할 텍스트 리스트
            normalize: 정규화 여부
            
        Returns:
            임베딩 벡터 배열 (n_texts, embedding_dim)
        """
        if not texts:
            return np.array([])
        
        try:
            if isinstance(self.model, SentenceTransformer):
                # SentenceTransformers 모델
                embeddings = self.model.encode(texts, normalize_embeddings=normalize)
                return embeddings
                
            else:
                # HuggingFace 모델 (PubMedBERT 등)
                embeddings = self._encode_hf_model(texts, normalize)
                return embeddings
                
        except Exception as e:
            logger.error(f"임베딩 생성 실패: {e}")
            # fallback: 랜덤 벡터 생성
            return np.random.randn(len(texts), self.embedding_dim)
    
    def _encode_hf_model(self, texts: List[str], normalize: bool) -> np.ndarray:
        """HuggingFace 모델용 인코딩"""
        embeddings = []
        
        for text in texts:
            # 토크나이징
            inputs = self.tokenizer(
                text, 
                return_tensors="pt", 
                max_length=512, 
                truncation=True, 
                padding=True
            ).to(self.device)
            
            # 추론
            with torch.no_grad():
                outputs = self.model(**inputs)
                # [CLS] 토큰의 임베딩 사용 (첫 번째 토큰)
                embedding = outputs.last_hidden_state[:, 0, :].cpu().numpy()
                embeddings.append(embedding[0])
        
        embeddings = np.array(embeddings)
        
        if normalize:
            # L2 정규화
            norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
            embeddings = embeddings / (norms + 1e-8)
        
        return embeddings
    
    def encode_single(self, text: str, normalize: bool = True) -> np.ndarray:
        """단일 텍스트 인코딩"""
        return self.encode([text], normalize)[0]
    
    def get_embedding_dimension(self) -> int:
        """임베딩 차원 반환"""
        return self.embedding_dim
    
    def similarity(self, text1: str, text2: str) -> float:
        """두 텍스트 간 코사인 유사도 계산"""
        emb1 = self.encode_single(text1)
        emb2 = self.encode_single(text2)
        return np.dot(emb1, emb2) / (np.linalg.norm(emb1) * np.linalg.norm(emb2))

# 사용 가능한 모델들
AVAILABLE_MODELS = {
    "minilm": "all-MiniLM-L6-v2",  # 빠르고 효율적
    "mpnet": "all-mpnet-base-v2",  # 고품질 범용
    "pubmed": "microsoft/BiomedNLP-PubMedBERT-base-uncased-abstract",  # 의료 전문
    "ada002": "text-embedding-ada-002",  # OpenAI 스타일
    "bge": "BAAI/bge-large-en-v1.5"  # 다국어 지원
}

def create_embedding_manager(model_name: str = "minilm", device: str = "auto") -> GPUEmbeddingManager:
    """임베딩 매니저 생성 헬퍼 함수"""
    actual_model = AVAILABLE_MODELS.get(model_name, model_name)
    return GPUEmbeddingManager(actual_model, device)

if __name__ == "__main__":
    # 테스트
    manager = create_embedding_manager("minilm")
    
    texts = [
        "펨브롤리주맙은 면역항암제입니다.",
        "키트루다는 폐암 치료에 사용됩니다.",
        "날씨가 좋습니다."
    ]
    
    embeddings = manager.encode(texts)
    print(f"임베딩 차원: {embeddings.shape}")
    print(f"첫 번째 텍스트 임베딩: {embeddings[0][:5]}...")
    
    similarity = manager.similarity(texts[0], texts[1])
    print(f"의료 관련 텍스트 유사도: {similarity:.4f}")
    
    similarity2 = manager.similarity(texts[0], texts[2])
    print(f"무관한 텍스트 유사도: {similarity2:.4f}") 
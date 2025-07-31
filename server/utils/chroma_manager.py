#!/opt/anaconda-3-2020.02/envs/chatbot_project/bin/python3
import os
import sys
import json

# ── 1) 부트스트랩 패치: 무조건 가장 먼저
os.environ["CHROMA_NO_DEFAULT_EMBEDDINGS"] = "True"

# 모듈 레벨에서 onnxruntime import 자체를 막기
class MockOnnxRuntime:
    def __getattr__(self, name):
        raise ImportError("onnxruntime is disabled")
sys.modules["onnxruntime"] = MockOnnxRuntime()

# DefaultEmbeddingFunction 바로 덮어쓰기
import chromadb.utils.embedding_functions as ef
ef.DefaultEmbeddingFunction = lambda *args, **kwargs: None

# ── 2) 이제야 Chroma/Client import
from chromadb import Client
from chromadb.config import Settings
# GPU 기반 임베딩 매니저 사용
from embedding_models import create_embedding_manager
from typing import List, Dict, Any

class ChromaManager:
    def __init__(self, db_path: str, model_name: str = "minilm", device: str = "auto"):
        """
        Args:
            db_path: ChromaDB 저장 경로
            model_name: 사용할 임베딩 모델 ("minilm", "pubmed", "mpnet" 등)
            device: "cuda", "cpu", "auto"
        """
        # GPU 기반 임베딩 매니저 초기화
        print(f"GPU 기반 임베딩 매니저 초기화 중... (모델: {model_name})")
        self.embedding_manager = create_embedding_manager(model_name, device)
        print("GPU 임베딩 매니저 초기화 완료")
        
        # ChromaDB 클라이언트 생성
        self.client = Client(Settings(
            persist_directory=db_path,
            is_persistent=True,
            anonymized_telemetry=False
        ))
        
        # 커스텀 embedding function 생성
        def custom_embedding_function(texts):
            embeddings = self.embedding_manager.encode(texts, normalize=True)
            return embeddings.tolist()
        
        # 컬렉션 생성 또는 가져오기
        try:
            self.collection = self.client.get_collection("hira_medical_docs")
            print("기존 컬렉션 로드됨")
        except:
            self.collection = self.client.create_collection(
                name="hira_medical_docs",
                embedding_function=custom_embedding_function
            )
            print("새 컬렉션 생성됨")
    
    def add_documents(self, documents: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        문서들을 벡터 DB에 추가
        
        Args:
            documents: [{"pageContent": str, "metadata": {...}}] 형태의 문서 리스트
        """
        try:
            if not documents:
                return {"success": True, "count": 0}
            
            # 텍스트와 메타데이터 분리
            texts = [d["pageContent"] for d in documents]
            metas = [d["metadata"] for d in documents]
            
            # 고유 ID 생성
            ids = [meta.get("id", f"doc_{i}_{hash(text[:50])}") for i, (text, meta) in enumerate(zip(texts, metas))]
            
            # 벡터 DB에 추가
            self.collection.add(
                documents=texts,
                metadatas=metas,
                ids=ids
            )
            
            print(f"✅ {len(documents)}개 문서 추가 완료")
            return {"success": True, "count": len(documents)}
            
        except Exception as e:
            print(f"❌ 문서 추가 실패: {e}")
            return {"success": False, "error": str(e)}
    
    def search(self, query: str, n_results: int = 5, filter_dict: Dict = None) -> Dict[str, Any]:
        """
        의미론적 검색 수행
        
        Args:
            query: 검색 쿼리
            n_results: 반환할 결과 수
            filter_dict: 필터 조건 (예: {"boardId": "HIRAA030023010000"})
        """
        try:
            # 검색 실행
            if filter_dict:
                res = self.collection.query(
                    query_texts=[query],
                    n_results=n_results,
                    where=filter_dict
                )
            else:
                res = self.collection.query(
                    query_texts=[query],
                    n_results=n_results
                )
            
            # 결과 포맷팅
            hits = []
            if res["documents"] and res["documents"][0]:
                for doc, meta, distance in zip(
                    res["documents"][0], 
                    res["metadatas"][0], 
                    res["distances"][0]
                ):
                    # 거리를 유사도 점수로 변환 (1 - 거리)
                    similarity_score = 1.0 - distance
                    hits.append({
                        "pageContent": doc, 
                        "metadata": meta, 
                        "score": similarity_score,
                        "distance": distance
                    })
            
            print(f"🔍 검색 완료: {len(hits)}개 결과")
            return {"success": True, "results": hits}
            
        except Exception as e:
            print(f"❌ 검색 실패: {e}")
            return {"success": False, "error": str(e)}
    
    def get_collection_info(self) -> Dict[str, Any]:
        """컬렉션 정보 조회"""
        try:
            count = self.collection.count()
            return {
                "success": True, 
                "document_count": count,
                "embedding_dimension": self.embedding_manager.get_embedding_dimension(),
                "model_name": self.embedding_manager.model_name
            }
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    def delete_collection(self) -> Dict[str, Any]:
        """컬렉션 삭제"""
        try:
            self.client.delete_collection("hira_medical_docs")
            print("✅ 컬렉션 삭제 완료")
            return {"success": True}
        except Exception as e:
            print(f"❌ 컬렉션 삭제 실패: {e}")
            return {"success": False, "error": str(e)}

def main():
    if len(sys.argv) < 3:
        print(json.dumps({"success": False, "error": "인수가 부족합니다."}))
        return

    cmd = sys.argv[1]
    data = json.loads(sys.argv[2])

    db_path = data.get("db_path", "./chroma_db")
    model_name = data.get("model_name", "minilm")
    device = data.get("device", "auto")
    
    # ChromaManager 초기화
    mgr = ChromaManager(db_path, model_name, device)
    
    if cmd == "add_documents":
        out = mgr.add_documents(data["documents"])
    elif cmd == "search":
        out = mgr.search(
            data["query"], 
            data.get("n_results", 5),
            data.get("filter_dict")
        )
    elif cmd == "info":
        out = mgr.get_collection_info()
    elif cmd == "delete":
        out = mgr.delete_collection()
    else:
        out = {"success": False, "error": f"알 수 없는 명령: {cmd}"}
    
    print(json.dumps(out, ensure_ascii=False))

if __name__ == "__main__":
    main() 
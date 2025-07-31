#!/usr/bin/env python3
"""
GPU 기반 임베딩 모델 테스트 스크립트
"""

import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), 'server', 'utils'))

from embedding_models import create_embedding_manager, AVAILABLE_MODELS
import json

def test_embedding_models():
    """사용 가능한 모든 임베딩 모델 테스트"""
    print("=== GPU 기반 임베딩 모델 테스트 ===\n")
    
    # 테스트 텍스트들
    test_texts = [
        "펨브롤리주맙은 면역항암제입니다.",
        "키트루다는 폐암 치료에 사용되는 면역항암제입니다.",
        "날씨가 좋습니다.",
        "의료진이 환자에게 항암치료를 권고했습니다.",
        "이 약물은 면역계를 활성화시켜 암세포를 공격합니다."
    ]
    
    # 각 모델 테스트
    for model_key, model_name in AVAILABLE_MODELS.items():
        print(f"🔬 {model_key.upper()} 모델 테스트 중...")
        print(f"   모델명: {model_name}")
        
        try:
            # 모델 초기화
            manager = create_embedding_manager(model_key, "auto")
            
            # 임베딩 생성
            embeddings = manager.encode(test_texts)
            print(f"   ✅ 임베딩 차원: {embeddings.shape}")
            
            # 유사도 테스트
            medical_sim = manager.similarity(test_texts[0], test_texts[1])  # 의료 관련
            unrelated_sim = manager.similarity(test_texts[0], test_texts[2])  # 무관한 텍스트
            
            print(f"   📊 의료 관련 텍스트 유사도: {medical_sim:.4f}")
            print(f"   📊 무관한 텍스트 유사도: {unrelated_sim:.4f}")
            
            # 유사도가 논리적으로 맞는지 확인
            if medical_sim > unrelated_sim:
                print(f"   ✅ 유사도 판단 정상 (의료 > 무관)")
            else:
                print(f"   ⚠️ 유사도 판단 이상 (의료 <= 무관)")
            
            print()
            
        except Exception as e:
            print(f"   ❌ 모델 로드 실패: {e}")
            print()

def test_chroma_integration():
    """ChromaDB와의 통합 테스트"""
    print("=== ChromaDB 통합 테스트 ===\n")
    
    try:
        from chroma_manager import ChromaManager
        
        # ChromaManager 초기화
        print("ChromaManager 초기화 중...")
        chroma_mgr = ChromaManager("./test_chroma_db", "minilm", "auto")
        print("✅ ChromaManager 초기화 완료")
        
        # 테스트 문서들
        test_documents = [
            {
                "pageContent": "펨브롤리주맙은 면역항암제로 폐암 치료에 사용됩니다.",
                "metadata": {
                    "id": "doc_1",
                    "title": "펨브롤리주맙 정보",
                    "type": "medical",
                    "boardId": "HIRAA030023010000"
                }
            },
            {
                "pageContent": "키트루다는 면역체크포인트 억제제로 다양한 암 치료에 효과적입니다.",
                "metadata": {
                    "id": "doc_2", 
                    "title": "키트루다 정보",
                    "type": "medical",
                    "boardId": "HIRAA030023010000"
                }
            },
            {
                "pageContent": "오늘 날씨가 매우 좋습니다.",
                "metadata": {
                    "id": "doc_3",
                    "title": "날씨 정보", 
                    "type": "general",
                    "boardId": "HIRAA030023010000"
                }
            }
        ]
        
        # 문서 추가
        print("테스트 문서 추가 중...")
        add_result = chroma_mgr.add_documents(test_documents)
        if add_result["success"]:
            print(f"✅ {add_result['count']}개 문서 추가 완료")
        else:
            print(f"❌ 문서 추가 실패: {add_result['error']}")
            return
        
        # 컬렉션 정보 확인
        info_result = chroma_mgr.get_collection_info()
        if info_result["success"]:
            print(f"📊 컬렉션 정보:")
            print(f"   - 문서 수: {info_result['document_count']}")
            print(f"   - 모델명: {info_result['model_name']}")
            print(f"   - 임베딩 차원: {info_result['embedding_dimension']}")
        
        # 검색 테스트
        print("\n🔍 검색 테스트:")
        search_queries = [
            "면역항암제",
            "폐암 치료",
            "날씨"
        ]
        
        for query in search_queries:
            print(f"\n   쿼리: '{query}'")
            search_result = chroma_mgr.search(query, n_results=2)
            
            if search_result["success"]:
                for i, result in enumerate(search_result["results"]):
                    print(f"   {i+1}. 점수: {result['score']:.4f}")
                    print(f"      내용: {result['pageContent'][:50]}...")
                    print(f"      메타: {result['metadata']['title']}")
            else:
                print(f"   ❌ 검색 실패: {search_result['error']}")
        
        # 필터 검색 테스트
        print(f"\n🔍 필터 검색 테스트 (의료 문서만):")
        filter_result = chroma_mgr.search(
            "면역항암제", 
            n_results=5, 
            filter_dict={"type": "medical"}
        )
        
        if filter_result["success"]:
            print(f"   의료 문서 검색 결과: {len(filter_result['results'])}개")
            for i, result in enumerate(filter_result["results"]):
                print(f"   {i+1}. {result['metadata']['title']} (점수: {result['score']:.4f})")
        else:
            print(f"   ❌ 필터 검색 실패: {filter_result['error']}")
        
        # 테스트 DB 정리
        print(f"\n🧹 테스트 DB 정리 중...")
        delete_result = chroma_mgr.delete_collection()
        if delete_result["success"]:
            print("✅ 테스트 DB 정리 완료")
        else:
            print(f"❌ DB 정리 실패: {delete_result['error']}")
            
    except Exception as e:
        print(f"❌ ChromaDB 통합 테스트 실패: {e}")

if __name__ == "__main__":
    print("🚀 GPU 기반 임베딩 모델 테스트 시작\n")
    
    # 1. 개별 모델 테스트
    test_embedding_models()
    
    # 2. ChromaDB 통합 테스트
    test_chroma_integration()
    
    print("✅ 모든 테스트 완료!") 
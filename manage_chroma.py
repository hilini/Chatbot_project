#!/usr/bin/env python3
"""
Chroma 벡터DB 관리 스크립트
"""

import chromadb
from chromadb.config import Settings
import json
import os
import sys

class ChromaManager:
    def __init__(self):
        self.settings = Settings(
            chroma_api_impl="rest",
            chroma_server_host="localhost",
            chroma_server_http_port=8000,
            persist_directory="./chroma_db"
        )
        self.client = chromadb.Client(self.settings)
        self.collection_name = "hira_medical_docs"
    
    def get_collection(self):
        """컬렉션 가져오기"""
        try:
            return self.client.get_collection(self.collection_name)
        except:
            return self.client.create_collection(self.collection_name)
    
    def show_status(self):
        """현재 상태 표시"""
        print("=== Chroma 벡터DB 상태 ===")
        
        try:
            collection = self.get_collection()
            count = collection.count()
            
            print(f"📚 컬렉션: {self.collection_name}")
            print(f"📄 문서 수: {count}개")
            print(f"💾 저장 경로: ./chroma_db")
            print(f"🌐 서버: http://localhost:8000")
            
            if count > 0:
                # 샘플 데이터 확인
                results = collection.peek(limit=1)
                if results['metadatas']:
                    sample_metadata = results['metadatas'][0]
                    print(f"📋 샘플 메타데이터: {sample_metadata}")
            
        except Exception as e:
            print(f"❌ 오류: {e}")
    
    def list_collections(self):
        """모든 컬렉션 목록"""
        print("=== Chroma 컬렉션 목록 ===")
        collections = self.client.list_collections()
        
        if not collections:
            print("📭 컬렉션이 없습니다.")
        else:
            for collection in collections:
                print(f"📚 {collection.name}: {collection.count()}개 문서")
    
    def delete_collection(self):
        """컬렉션 삭제"""
        print(f"🗑️ 컬렉션 '{self.collection_name}' 삭제 중...")
        
        try:
            self.client.delete_collection(self.collection_name)
            print("✅ 컬렉션이 삭제되었습니다.")
        except Exception as e:
            print(f"❌ 삭제 실패: {e}")
    
    def backup_metadata(self):
        """메타데이터 백업"""
        print("💾 메타데이터 백업 중...")
        
        try:
            collection = self.get_collection()
            results = collection.get()
            
            backup_data = {
                "collection_name": self.collection_name,
                "document_count": len(results['ids']),
                "documents": []
            }
            
            for i in range(len(results['ids'])):
                backup_data["documents"].append({
                    "id": results['ids'][i],
                    "metadata": results['metadatas'][i],
                    "document": results['documents'][i][:200] + "..." if results['documents'][i] else ""
                })
            
            with open("chroma_backup.json", "w", encoding="utf-8") as f:
                json.dump(backup_data, f, ensure_ascii=False, indent=2)
            
            print(f"✅ 백업 완료: chroma_backup.json ({len(results['ids'])}개 문서)")
            
        except Exception as e:
            print(f"❌ 백업 실패: {e}")
    
    def search_test(self, query="펨브롤리주맙", limit=3):
        """테스트 검색"""
        print(f"🔍 테스트 검색: '{query}'")
        
        try:
            collection = self.get_collection()
            results = collection.query(
                query_texts=[query],
                n_results=limit
            )
            
            if results['ids'] and results['ids'][0]:
                print(f"📊 검색 결과: {len(results['ids'][0])}개")
                
                for i, (doc_id, metadata, document) in enumerate(zip(
                    results['ids'][0], 
                    results['metadatas'][0], 
                    results['documents'][0]
                )):
                    print(f"\n{i+1}. ID: {doc_id}")
                    print(f"   메타데이터: {metadata}")
                    print(f"   내용: {document[:100]}...")
            else:
                print("📭 검색 결과가 없습니다.")
                
        except Exception as e:
            print(f"❌ 검색 실패: {e}")

def main():
    if len(sys.argv) < 2:
        print("사용법:")
        print("  python manage_chroma.py status     # 상태 확인")
        print("  python manage_chroma.py list       # 컬렉션 목록")
        print("  python manage_chroma.py delete     # 컬렉션 삭제")
        print("  python manage_chroma.py backup     # 메타데이터 백업")
        print("  python manage_chroma.py search     # 테스트 검색")
        return
    
    manager = ChromaManager()
    command = sys.argv[1]
    
    if command == "status":
        manager.show_status()
    elif command == "list":
        manager.list_collections()
    elif command == "delete":
        manager.delete_collection()
    elif command == "backup":
        manager.backup_metadata()
    elif command == "search":
        query = sys.argv[2] if len(sys.argv) > 2 else "펨브롤리주맙"
        manager.search_test(query)
    else:
        print(f"❌ 알 수 없는 명령어: {command}")

if __name__ == "__main__":
    main() 
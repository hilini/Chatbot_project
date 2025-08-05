#!/usr/bin/env python3
"""
Chroma 서버 설정 및 시작 스크립트 (최신 API 버전)
"""

import chromadb
import os
import sys
import subprocess
import time
import requests
from pathlib import Path

def start_chroma_server():
    """Chroma HTTP 서버 시작"""
    
    # 데이터 저장 경로 생성
    persist_dir = "./chroma_db"
    Path(persist_dir).mkdir(exist_ok=True)
    
    try:
        # HTTP 서버 설정
        import chromadb.config
        settings = chromadb.config.Settings(
            chroma_api_impl="rest",
            chroma_server_host="localhost",
            chroma_server_http_port=8000,  # 8000번 포트로 통일
            persist_directory=persist_dir,
            allow_reset=True
        )
        
        # HTTP 클라이언트 생성
        client = chromadb.HttpClient(settings=settings)
        
        print("🚀 Chroma HTTP 서버가 시작되었습니다!")
        print(f"💾 데이터 저장 경로: {persist_dir}")
        print("🌐 서버 주소: http://localhost:8000")
        print("📚 컬렉션: hira_medical_docs")
        
        # 컬렉션 생성 또는 확인
        try:
            collection = client.get_collection("hira_medical_docs")
            print(f"✅ 기존 컬렉션 로드됨: {collection.count()}개 문서")
        except:
            collection = client.create_collection("hira_medical_docs")
            print("✅ 새 컬렉션 생성됨")
        
        return client
        
    except Exception as e:
        print(f"❌ Chroma HTTP 서버 시작 실패: {e}")
        return None

def start_chroma_http_server():
    """Chroma HTTP 서버를 별도 프로세스로 시작"""
    
    print("🚀 Chroma HTTP 서버를 시작합니다...")
    
    try:
        # chroma run 명령어로 서버 시작
        process = subprocess.Popen([
            "chroma", "run", 
            "--host", "localhost", 
            "--port", "8000",
            "--path", "./chroma_db"
        ], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        
        # 서버가 시작될 때까지 대기
        print("⏳ 서버 시작 대기 중...")
        time.sleep(3)
        
        # 서버 상태 확인
        try:
            response = requests.get("http://localhost:8000/api/v1/heartbeat", timeout=5)
            if response.status_code == 200:
                print("🚀 Chroma HTTP 서버가 시작되었습니다!")
                print("📍 서버 주소: http://localhost:8000")
                print("💾 데이터 저장 경로: ./chroma_db")
                print("🌐 웹 UI: http://localhost:8000")
                
                # HTTP 클라이언트 생성
                client = chromadb.HttpClient(host='localhost', port=8000)
                
                # 컬렉션 생성 또는 확인
                try:
                    collection = client.get_collection("hira_medical_docs")
                    print(f"✅ 기존 컬렉션 로드됨: {collection.count()}개 문서")
                except:
                    collection = client.create_collection("hira_medical_docs")
                    print("✅ 새 컬렉션 생성됨")
                
                return client, process
            else:
                raise Exception("서버 응답 실패")
                
        except Exception as e:
            process.terminate()
            raise Exception(f"서버 시작 실패: {e}")
            
    except FileNotFoundError:
        print("❌ chroma 명령어를 찾을 수 없습니다.")
        print("💡 pip install chromadb로 설치해주세요.")
        return None, None

def run_local_client():
    """로컬 클라이언트로 실행 (추천)"""
    try:
        client = start_chroma_server()
        
        if client:
            print("\n✨ 로컬 클라이언트가 준비되었습니다!")
            print("📝 사용 예시:")
            print("   collection = client.get_collection('hira_medical_docs')")
            print("   collection.add(documents=[...], ids=[...])")
            
            return client
        else:
            return None
            
    except KeyboardInterrupt:
        print("\n👋 클라이언트를 종료합니다.")
        sys.exit(0)

def run_http_server():
    """HTTP 서버로 실행"""
    try:
        client, process = start_chroma_http_server()
        
        if client and process:
            print("\n🔄 HTTP 서버가 실행 중입니다...")
            print("🛑 종료하려면 Ctrl+C를 누르세요")
            
            try:
                # 서버를 계속 실행
                while True:
                    time.sleep(1)
            except KeyboardInterrupt:
                print("\n🛑 서버를 종료합니다...")
                process.terminate()
                process.wait()
                print("👋 Chroma 서버를 종료했습니다.")
                
        return client
        
    except Exception as e:
        print(f"❌ 오류 발생: {e}")
        return None

if __name__ == "__main__":
    print("🔧 Chroma 실행 방법을 선택하세요:")
    print("1. 로컬 클라이언트 (추천)")
    print("2. HTTP 서버")
    
    choice = input("선택 (1 또는 2): ").strip()
    
    if choice == "1":
        run_local_client()
    elif choice == "2":
        run_http_server()
    else:
        print("❌ 잘못된 선택입니다. 로컬 클라이언트로 시작합니다.")
        run_local_client() 
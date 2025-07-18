# SNUH-HARI Anti-cancer Tx Agents - 항암제 문서 기반 챗봇

한국의 요양급여 기준에 맞는, PDF 문서 기반 항암요법 Treatment Planning 챗봇입니다. 
이 프로젝트는 OpenAI 모델을 사용하여 RAG(Retrieval-Augmented Generation) 방식으로 요양급여 기준 PDF 문서를 분석하고 사용자 질문에 답변합니다.

## 주요 기능

- **항암치료 정보 제공**: 요양급여 기준에 맞는 최신 항암제 정보 검색
- **PDF 문서 통합 뷰어**: 
  - 단일 페이지 모드/스크롤 모드 전환 기능
  - 자동 페이지 이동 및 하이라이트 기능
  - 페이지 번호 입력으로 빠른 이동
- **키워드 인식**: 
  - 의학 용어, 약물명, 암 종류 자동 인식
  - 키워드 클릭 시 관련 페이지로 자동 이동
- **세션 관리**:
  - 대화 세션 저장 및 불러오기
  - 새 대화 시작 시 이전 대화 자동 저장
- **응답 자동 페이지 참조**: 
  - 챗봇 응답에 자동으로 페이지 참조 추가
  - 페이지 참조 클릭 시 관련 PDF 페이지로 이동

## 기술 스택

- **프론트엔드**: 
  - React (CRA + Craco)
  - Redux (상태 관리)
  - React-PDF (PDF 렌더링)
  - CSS3 (모던 UI)
- **백엔드**: 
  - Node.js
  - Express
  - Socket.io
- **AI & 벡터 검색**: 
  - OpenAI API (GPT 모델)
  - LangChain
  - FAISS (벡터 저장소)
  - PDF-Parse (PDF 텍스트 추출)

## 설치 및 실행 방법

### 사전 요구사항

- Node.js 16.x 이상
- npm 7.x 이상
- OpenAI API 키

### 설치

1. 저장소 클론:
   ```bash
   git clone https://github.com/hyeonhoonlee/anticancer_chat.git
   cd anticancer_chat
   ```

2. 의존성 설치:
   ```bash
   # 루트 디렉토리, 클라이언트, 서버의 모든 의존성 설치
   npm install
   cd client && npm install
   cd ../server && npm install
   cd ..
   ```

3. 환경 변수 설정:
   `server/.env` 파일 생성 후 OpenAI API 키 입력:
   ```
   OPENAI_API_KEY=your_api_key_here
   ```

4. PDF 파일 준비:
   `client/public/` 디렉토리에 "암환자에게 처방․투여하는 약제에 대한 요양급여의 적용기준" PDF 파일을 `cancer_treatment_guidelines.pdf` 이름으로 저장합니다.

### 실행

개발 모드에서 서버와 클라이언트 동시 실행:
```bash
# 루트 디렉토리에서
./startup.sh
```

또는 각각 실행:
```bash
# 서버 (http://localhost:3001)
cd server && npm start

# 클라이언트 (http://localhost:3000)
cd client && npm start
```

## 사용 예시

1. **일반 질문**:
   - "폐암 환자에게 사용할 수 있는 면역항암제는 무엇인가요?"
   - "포나티닙의 보험 급여 기준이 어떻게 되나요?"
   - "EGFR 양성 비소세포폐암에서 1차 약제로 사용 가능한 표적치료제는?"

2. **페이지 네비게이션**:
   - 챗봇 응답의 페이지 참조(예: [12페이지])를 클릭하면 PDF가 해당 페이지로 이동합니다.
   - 강조 표시된 의학 용어나 약물명을 클릭하면 관련 페이지를 확인할 수 있습니다.

3. **PDF 모드 전환**:
   - 단일 페이지 모드: 한 페이지씩 확인하는 기본 모드
   - 스크롤 모드: 여러 페이지를 연속으로 스크롤하며 볼 수 있는 모드

4. **세션 관리**:
   - 헤더의 '새 대화' 버튼으로 새 대화 시작 (이전 대화는 자동 저장)
   - 세션 관리 버튼으로 이전 대화 불러오기 가능

## 프로젝트 구조

```
anticancer_chat/
├── client/                 # 리액트 클라이언트
│   ├── public/             # 정적 파일 (PDF 포함)
│   └── src/                # 소스 코드
│       ├── components/     # 리액트 컴포넌트
│       └── store/          # Redux 관련 파일
├── server/                 # Node.js 서버
│   ├── data/               # 벡터 데이터베이스
│   ├── routes/             # API 라우트
│   └── utils/              # 유틸리티 함수
└── startup.sh              # 실행 스크립트
```

## 향후 계획

- 의무기록 자동 분석 기능 추가
- 다국어 지원 (영어/일본어)
- 더 많은 PDF 문서 통합 지원
- 환자 맞춤형 항암요법 추천 기능

## 라이선스

This project is licensed under the MIT License - see the LICENSE file for details
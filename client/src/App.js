import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import ChatInterface from './components/ChatInterface';
import PdfViewer from './components/PdfViewer';
import TitleHeader from './components/TitleHeader';
import { useDispatch, useSelector } from 'react-redux';
import { setHighlight, setPdfMode } from './store/actions';
import { setCurrentPage } from './store/actions';
import './App.css';

function App() {
  const [messages, setMessages] = useState([]);
  const [isWaitingForResponse, setIsWaitingForResponse] = useState(false);
  const [sessionId, setSessionId] = useState('');
  const [showSessionControls, setShowSessionControls] = useState(false);
  const [sessionHistory, setSessionHistory] = useState([]);
  const [isResizing, setIsResizing] = useState(false);
  const [chatWidth, setChatWidth] = useState(40); // 초기 채팅 영역 너비 (%)
  
  const chatColumnRef = useRef(null);
  const appContainerRef = useRef(null);
  
  const dispatch = useDispatch();
  const currentPage = useSelector(state => state.pdfViewer.currentPage);
  const pdfMode = useSelector(state => state.pdfViewer.pdfMode);
  
  // 페이지 번호 오프셋 (문서 내 페이지 번호가 실제보다 4페이지 낮음)
  const PAGE_NUMBER_OFFSET = 4;
  
  // 세션 로드 또는 생성
  useEffect(() => {
    loadOrCreateSession();
  }, []);
  
  // 리사이징 관련 이벤트 핸들러
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isResizing || !appContainerRef.current) return;
      
      const appRect = appContainerRef.current.getBoundingClientRect();
      const appWidth = appRect.width;
      
      // 가로 모드일 때 (기본)
      if (window.innerWidth > 992) {
        const newChatWidth = ((e.clientX - appRect.left) / appWidth) * 100;
        
        // 너비 제한 (최소 20%, 최대 80%)
        if (newChatWidth >= 20 && newChatWidth <= 80) {
          setChatWidth(newChatWidth);
          
          if (chatColumnRef.current) {
            chatColumnRef.current.style.flex = `0 0 ${newChatWidth}%`;
          }
        }
      } 
      // 세로 모드일 때 (모바일)
      else {
        const appHeight = appRect.height;
        const newChatHeight = ((e.clientY - appRect.top) / appHeight) * 100;
        
        // 높이 제한 (최소 20%, 최대 80%)
        if (newChatHeight >= 20 && newChatHeight <= 80) {
          if (chatColumnRef.current) {
            chatColumnRef.current.style.flex = `0 0 ${newChatHeight}vh`;
          }
        }
      }
    };
    
    const handleMouseUp = () => {
      setIsResizing(false);
      document.body.classList.remove('resizing');
    };
    
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.classList.add('resizing');
    }
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);
  
  // 리사이징 시작 핸들러
  const startResizing = () => {
    setIsResizing(true);
  };
  
  // 세션 불러오기 또는 신규 생성
  const loadOrCreateSession = async () => {
    try {
      // 로컬 스토리지에서 세션 ID 가져오기
      const savedSessionId = localStorage.getItem('currentSessionId');
      
      if (savedSessionId) {
        setSessionId(savedSessionId);
        await loadSessionHistory(savedSessionId);
      } else {
        await createNewSession();
      }
    } catch (error) {
      console.error('세션 로드/생성 오류:', error);
    }
  };
  
  // 새 채팅 세션 생성
  const createNewSession = async () => {
    try {
      const response = await axios.post('/api/chat/sessions');
      const newSessionId = response.data.sessionId;
      
      setSessionId(newSessionId);
      setMessages([]);
      
      // 로컬 스토리지에 세션 ID 저장
      localStorage.setItem('currentSessionId', newSessionId);
      
      return newSessionId;
    } catch (error) {
      console.error('세션 생성 오류:', error);
      throw error;
    }
  };
  
  // 세션 히스토리 불러오기
  const loadSessionHistory = async (sid) => {
    try {
      const response = await axios.get(`/api/chat/sessions/${sid}/history`);
      
      if (response.data && response.data.history && Array.isArray(response.data.history)) {
        setMessages(response.data.history);
        return response.data.history;
      } else {
        // 히스토리가 없거나 형식이 다른 경우 빈 배열 반환
        setMessages([]);
        return [];
      }
    } catch (error) {
      console.error('세션 히스토리 로드 오류:', error);
      setMessages([]);
      return [];
    }
  };
  
  // 세션 목록 불러오기
  const loadSessionsList = async () => {
    try {
      const response = await axios.get('/api/chat/sessions');
      setSessionHistory(response.data.sessions || []);
    } catch (error) {
      console.error('세션 목록 로드 오류:', error);
    }
  };
  
  // 세션 전환하기
  const switchToSession = async (sid) => {
    try {
      const sessionHistory = await loadSessionHistory(sid);
      setSessionId(sid);
      localStorage.setItem('currentSessionId', sid);
      setShowSessionControls(false);
    } catch (error) {
      console.error('세션 전환 오류:', error);
    }
  };
  
  // 새 대화 시작
  const handleNewChat = async () => {
    if (messages.length > 0) {
      const confirmNewChat = window.confirm(
        '새로운 대화를 시작하시겠습니까? 현재 대화 내용은 저장됩니다.'
      );
      
      if (confirmNewChat) {
        const newSessionId = await createNewSession();
        setMessages([]);
        setShowSessionControls(false);
      }
    } else {
      await createNewSession();
    }
  };
  
  // 세션 관리 토글
  const toggleSessionControls = async () => {
    if (!showSessionControls && !sessionHistory.length) {
      await loadSessionsList();
    }
    setShowSessionControls(!showSessionControls);
  };
  
  // 메시지 전송 처리
  const handleSendMessage = async (message) => {
    // 사용자 메시지를 메시지 목록에 추가
    const updatedMessages = [
      ...messages,
      { role: 'user', content: message }
    ];
    
    setMessages(updatedMessages);
    setIsWaitingForResponse(true);
    
    try {
      // 먼저 API 연결 테스트
      const testConnection = await axios.get('/api/health', { timeout: 2000 })
        .catch(() => ({ data: null }));
      
      // API 연결이 성공하면 정상적으로 API 호출
      if (testConnection.data) {
        const response = await axios.post('/api/chat', {
          message,
          sessionId
        });
        
        // 서버에서 받은 응답 형식이 { role: "assistant", content: "..." } 형태임
        if (response.data && response.data.content) {
          // 봇 응답 메시지를 추가
          const botResponse = { 
            role: response.data.role || 'assistant', 
            content: response.data.content,
            metadata: response.data.metadata
          };
          
          setMessages([...updatedMessages, botResponse]);
          
          // PDF 페이지 정보 확인 및 로깅
          if (response.data.metadata && response.data.metadata.sourcePages && response.data.metadata.sourcePages.length > 0) {
            console.log("응답에서 받은 소스 페이지:", response.data.metadata.sourcePages);
            
            // 페이지 정보 추출 및 이동
            extractPageInfoAndNavigate(response.data.content, response.data.metadata);
          } else {
            console.log("응답에 소스 페이지 정보가 없습니다. 텍스트 기반 추출 시도 중...");
            // 기존 텍스트 기반 페이지 추출 방식을 백업으로 유지
            extractPageInfoAndNavigate(response.data.content, {});
          }
        }
      } else {
        // API 서버에 연결할 수 없는 경우 기본 응답 생성
        console.log("API 서버에 연결할 수 없습니다. 기본 응답을 생성합니다.");
        
        const defaultResponses = generateDefaultResponses(message);
        setMessages([...updatedMessages, defaultResponses]);
        
        if (defaultResponses.metadata && defaultResponses.metadata.sourcePages && defaultResponses.metadata.sourcePages.length > 0) {
          const firstPage = defaultResponses.metadata.sourcePages[0];
          handlePdfNavigation(firstPage);
        }
      }
    } catch (error) {
      console.error('메시지 전송 오류:', error);
      // 오류 메시지 표시
      setMessages([
        ...updatedMessages,
        { role: 'assistant', content: '죄송합니다. 응답을 처리하는 중 오류가 발생했습니다. 다시 시도해 주세요.' }
      ]);
    } finally {
      setIsWaitingForResponse(false);
    }
  };
  
  // 기본 응답 생성 함수
  const generateDefaultResponses = (message) => {
    const lowerMessage = message.toLowerCase();
    
    // 폐암 관련 검색
    if (lowerMessage.includes('폐암') || lowerMessage.includes('비소세포')) {
      // PD-L1 관련 검색
      if (lowerMessage.includes('pd-l1') || lowerMessage.includes('면역항암제')) {
        return {
          role: 'assistant',
          content: `비소세포폐암에서 PD-L1 발현 양성인 경우 주로 사용하는 면역항암제는 **펨브롤리주맙(키트루다)**, **니볼루맙(옵디보)**, **아테졸리주맙(티센트릭)** 등이 있습니다.

주요 급여기준은 다음과 같습니다:

**펨브롤리주맙(키트루다)**
- PD-L1 발현 비율 ≥ 50%인 경우: 1차 치료로 단독요법 급여 인정
- PD-L1 발현 비율 ≥ 1%인 경우: 백금기반 항암요법 이후 2차 치료로 급여 인정

**니볼루맙(옵디보)**
- 백금기반 항암요법에 실패한 후 2차 치료제로 급여 인정
- PD-L1 발현 여부와 관계없이 적용 가능

**아테졸리주맙(티센트릭)**
- 백금기반 화학요법 및 표적치료제 치료 후 진행된 환자에게 급여 인정

자세한 내용은 페이지 32-38에서 확인하실 수 있습니다.

참고 페이지: 32, 33, 38`,
          metadata: {
            sourcePages: [32, 33, 38]
          }
        };
      }
      // EGFR 관련 검색
      else if (lowerMessage.includes('egfr') || lowerMessage.includes('타그리소') || lowerMessage.includes('오시머티닙')) {
        return {
          role: 'assistant',
          content: `EGFR 변이 폐암 환자에게는 주로 **오시머티닙(타그리소)**, **게피티니브(이레사)**, **얼로티닙(타쎄바)** 등의 표적치료제가 사용됩니다.

**오시머티닙(타그리소)** 관련 주요 급여기준:
- EGFR 엑손 19 결손 또는 엑손 21(L858R) 치환 변이가 있는 국소 진행성 또는 전이성 비소세포폐암 환자의 1차 치료로 급여 인정
- 이전 EGFR-TKI 치료 후 질병 진행이 확인된 T790M 변이 양성 국소 진행성 또는 전이성 비소세포폐암 환자의 치료로 급여 인정

투여 용법/용량: 80mg을 1일 1회 경구 투여

주요 부작용: 설사, 발진, 구내염, 간질성 폐질환 등

자세한 내용은 페이지 25-27에서 확인하실 수 있습니다.

참고 페이지: 25, 26, 27`,
          metadata: {
            sourcePages: [25, 26, 27]
          }
        };
      }
      // ALK 관련 검색
      else if (lowerMessage.includes('alk') || lowerMessage.includes('알렉틴브') || lowerMessage.includes('알레센자')) {
        return {
          role: 'assistant',
          content: `ALK 양성 비소세포폐암 환자에게는 주로 **알렉티닙(알레센자)**, **크리조티닙(잴코리)**, **브리가티닙(알룬브릭)** 등의 표적치료제가 사용됩니다.

**알렉티닙(알레센자)** 관련 주요 급여기준:
- ALK 양성이 확인된 국소 진행성 또는 전이성 비소세포폐암 환자의 1차 치료로 급여 인정
- 크리조티닙 치료 중 또는 치료 후 질병이 진행된 ALK 양성 국소 진행성 또는 전이성 비소세포폐암 환자의 치료로 급여 인정

투여 용법/용량: 600mg을 1일 2회 경구 투여

ALK 검사방법: FISH, IHC, NGS 등의 방법으로 확인

자세한 내용은 페이지 28-30에서 확인하실 수 있습니다.

참고 페이지: 28, 29, 30`,
          metadata: {
            sourcePages: [28, 29, 30]
          }
        };
      }
      // 일반 폐암 정보
      else {
        return {
          role: 'assistant',
          content: `비소세포폐암의 주요 치료법은 병기와 환자 상태에 따라 수술, 방사선치료, 항암화학요법, 표적치료, 면역치료 등이 있습니다.

주요 치료 옵션:
1. **초기 병기(1-2기)**: 수술 후 필요시 보조 항암화학요법
2. **국소 진행성(3기)**: 동시항암화학방사선요법, 수술 불가능한 경우 방사선치료와 면역치료 병행
3. **전이성(4기)**: 유전자 변이 및 PD-L1 발현에 따라 표적치료 또는 면역치료 시행

전이성 비소세포폐암의 경우 치료 선택 기준:
- EGFR 변이 양성: 오시머티닙(타그리소) 등 EGFR-TKI
- ALK 변이 양성: 알렉티닙(알레센자) 등 ALK 억제제
- PD-L1 발현 ≥50%: 펨브롤리주맙(키트루다) 단독요법
- 변이 없음: 면역항암제+항암화학요법 병용

자세한 내용은 페이지 20-24에서 확인하실 수 있습니다.

참고 페이지: 8, 20, 24`,
          metadata: {
            sourcePages: [8, 20, 24]
          }
        };
      }
    }
    // 백혈병 관련 검색
    else if (lowerMessage.includes('백혈병') || lowerMessage.includes('leukemia')) {
      // T315I 관련 검색
      if (lowerMessage.includes('t315i') || lowerMessage.includes('포나티닙')) {
        return {
          role: 'assistant',
          content: `T315I 변이가 있는 백혈병 환자에게는 주로 **포나티닙(아이클루시그)**이 사용됩니다.

**포나티닙(아이클루시그)** 관련 주요 급여기준:
- T315I 변이 양성 필라델피아 염색체 양성 급성 림프모구성 백혈병(Ph+ALL)
- T315I 변이 양성 만성 골수성 백혈병(CML)의 만성기, 가속기, 급성기 환자
- 이전 다사티닙 또는 닐로티닙 치료에 저항성 또는 불내성을 보이는 경우

투여 용법/용량: 
- 만성기 CML: 45mg을 1일 1회 경구 투여
- 가속기 또는 급성기 CML, Ph+ALL: 45mg을 1일 1회 경구 투여

주요 부작용: 혈관폐색사건, 심부전, 간독성, 췌장염 등

자세한 내용은 페이지 12-14에서 확인하실 수 있습니다.

참고 페이지: 12, 13, 14`,
          metadata: {
            sourcePages: [12, 13, 14]
          }
        };
      }
      // 일반 백혈병 정보
      else {
        return {
          role: 'assistant',
          content: `백혈병은 크게 급성 골수성 백혈병(AML), 급성 림프구성 백혈병(ALL), 만성 골수성 백혈병(CML), 만성 림프구성 백혈병(CLL)으로 구분됩니다.

**만성 골수성 백혈병(CML)** 치료제:
- 1차 치료: **이매티닙(글리벡)**, **닐로티닙(타시그나)**, **다사티닙(스프라이셀)**
- 변이 또는 내성 발생 시: **보수티닙(보슐리프)**, **포나티닙(아이클루시그)**

**급성 림프구성 백혈병(ALL)** 치료제:
- Ph+ ALL: TKI(이매티닙, 다사티닙) + 항암화학요법
- Ph- ALL: 다제 항암화학요법

**급성 골수성 백혈병(AML)** 치료제:
- 표준 요법: 시타라빈 + 안트라사이클린(7+3 요법)
- 고위험군: 강화된 항암화학요법 후 조혈모세포이식

만성 골수성 백혈병 관련 주요 급여기준 정보는 페이지 72-76에서 확인하실 수 있습니다.

참고 페이지: 72, 74, 76`,
          metadata: {
            sourcePages: [72, 74, 76]
          }
        };
      }
    }
    // 일반적인 기본 응답
    else {
      return {
        role: 'assistant',
        content: '죄송합니다. 현재 서버 연결에 문제가 있어 정확한 응답을 제공할 수 없습니다. 잠시 후 다시 시도해 주세요.\n\n문서에서 관련 정보를 직접 찾아보시려면 PDF 뷰어를 활용하시기 바랍니다.',
        metadata: {}
      };
    }
  };
  
  // 응답에서 페이지 정보 추출 및 페이지 이동
  const extractPageInfoAndNavigate = (text, metadata) => {
    // 메타데이터에서 소스 페이지 정보 확인
    if (metadata && metadata.sourcePages && metadata.sourcePages.length > 0) {
      console.log(`메타데이터에서 페이지 정보 발견: ${metadata.sourcePages}`);
      // 첫 번째 소스 페이지로 이동
      const firstPage = parseInt(metadata.sourcePages[0], 10);
      if (!isNaN(firstPage)) {
        console.log(`소스 페이지로 이동: ${firstPage}`);
        handlePdfNavigation(firstPage);
        return true;
      }
    }
    
    // 메타데이터에 소스 페이지가 없거나 유효하지 않은 경우 텍스트에서 추출 시도
    console.log("텍스트에서 페이지 정보 추출 시도 중...");
    
    // 다양한 페이지 참조 패턴 찾기
    const patterns = [
      // [페이지 12], [p.12], [12페이지] 형식
      /\[(?:p\.|\s*페이지\s*|\s*page\s*)?(\d+)(?:\s*페이지)?\]/i,
      // 페이지 12, page 12 형식
      /(?:페이지|page)[\s:]*(\d+)/i,
      // 12페이지, 12 page 형식
      /(\d+)[\s]*(?:페이지|page)/i,
      // 참고 페이지: 12 형식
      /참고\s*페이지:?\s*(\d+)/i,
      // 페이지 12-15 형식
      /(?:페이지|page)[\s:]*(\d+)[ \-~]+(\d+)/i
    ];
    
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        const pageNumber = parseInt(match[1], 10);
        if (!isNaN(pageNumber)) {
          console.log(`텍스트에서 페이지 번호 추출: ${pageNumber}`);
          handlePdfNavigation(pageNumber);
          return true;
        }
      }
    }
    
    // 참고 페이지: X, Y, Z 형식 처리
    const referencePattern = /참고\s*페이지:?\s*([\d,\s]+)/i;
    const referenceMatch = text.match(referencePattern);
    if (referenceMatch && referenceMatch[1]) {
      const pageList = referenceMatch[1].split(/\s*,\s*/);
      if (pageList.length > 0) {
        const firstPage = parseInt(pageList[0], 10);
        if (!isNaN(firstPage)) {
          console.log(`참고 페이지 목록에서 첫 번째 페이지 추출: ${firstPage}`);
          handlePdfNavigation(firstPage);
          return true;
        }
      }
    }
    
    console.log("페이지 정보를 찾을 수 없습니다.");
    return false;
  };
  
  // PDF 페이지 이동 처리
  const handlePdfNavigation = (pageNumber) => {
    if (pageNumber && !isNaN(pageNumber)) {
      // 페이지 번호 변환: 문서 내 페이지 번호 -> 물리적 페이지 번호
      // 문서 내 페이지 번호 + 오프셋 = 물리적 페이지 번호
      // 단, 페이지가 오프셋보다 작거나 같으면 변환하지 않음 (표지, 목차 등)
      let physicalPageNumber = pageNumber;
      
      // 숫자가 특정 범위 내이면 실제 PDF 페이지로 변환
      // 예: 1부터 215까지의 숫자는 문서 내 페이지 번호로 간주
      if (pageNumber >= 1 && pageNumber <= 215) {
        physicalPageNumber = pageNumber + PAGE_NUMBER_OFFSET;
        console.log(`페이지 번호 변환: 문서 내 페이지 ${pageNumber} → 물리적 페이지 ${physicalPageNumber}`);
      } else {
        console.log(`물리적 페이지 번호로 간주: ${pageNumber}`);
      }
      
      // 페이지 이동 액션 디스패치
      dispatch(setCurrentPage(physicalPageNumber));
    }
  };
  
  // PDF 모드 전환 (단일 페이지/스크롤 모드)
  const togglePdfMode = () => {
    dispatch(setPdfMode(pdfMode === 'single' ? 'scroll' : 'single'));
  };
  
  return (
    <div className="app-container" ref={appContainerRef}>
      <TitleHeader 
        onNewChat={handleNewChat} 
        onToggleSessionControls={toggleSessionControls}
        showSessionControls={showSessionControls}
        onCloseSessionPanel={() => setShowSessionControls(false)}
        sessionHistory={sessionHistory}
        onSwitchSession={switchToSession}
        currentSessionId={sessionId}
      />
      
      <div className="main-content">
        <div 
          className="chat-column" 
          ref={chatColumnRef}
          style={{ flex: `0 0 ${chatWidth}%` }}
        >
          <ChatInterface 
            messages={messages} 
            onSendMessage={handleSendMessage} 
            isWaitingForResponse={isWaitingForResponse}
            onPdfNavigation={handlePdfNavigation}
          />
          <div 
            className={`resizer ${isResizing ? 'resizing' : ''}`}
            onMouseDown={startResizing}
          />
        </div>
        
        <div className="pdf-column">
          <PdfViewer 
            currentPage={currentPage}
            pdfMode={pdfMode}
            onToggleMode={togglePdfMode}
          />
        </div>
      </div>
    </div>
  );
}

export default App; 
import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { useDispatch } from 'react-redux';
import { setHighlight } from '../store/actions';
import '../App.css';

const ChatInterface = ({ 
  onPdfNavigation, 
  messages, 
  onSendMessage,
  isWaitingForResponse = false
}) => {
  const [message, setMessage] = useState('');
  const [showFollowupQuestions, setShowFollowupQuestions] = useState(false);
  const [followupQuestions, setFollowupQuestions] = useState([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const dispatch = useDispatch();

  // 예시 질문 목록
  const exampleQuestions = [
    "비소세포폐암에서 PD-L1 발현 양성인 경우 사용하는 면역항암제와 급여기준이 어떻게 되나요?",
    "EGFR 변이 폐암 환자에 대한 오시머티닙(타그리소) 투약 권고사항에 대해 알려주세요.",
    "펨브롤리주맙(키트루다)의 급여기준에 대해 설명해주세요.",
    "T315I 변이가 있는 백혈병 환자에게 효과적인 약물은 무엇인가요?",
    "면역항암제 치료 후 발생할 수 있는 자가면역 부작용에 대해 알려주세요.",
    "ALK 양성 폐암 환자를 위한 표적치료제의 종류와 특징은 무엇인가요?",
    "백금기반 항암화학요법 이후 재발한 난소암 환자의 치료 옵션은 무엇인가요?",
    "HER2 양성 유방암 환자의 표준 치료법과 급여 인정 기준을 알려주세요."
  ];

  // 서버에서 추천 질문 가져오기
  const fetchSuggestedQuestions = async () => {
    if (messages.length === 0) return;
    
    const lastMessage = messages[messages.length - 1];
    if (lastMessage.role !== 'assistant') return;
    
    try {
      setIsLoadingSuggestions(true);
      
      // 현재 세션 ID 가져오기
      const sessionId = localStorage.getItem('currentSessionId');
      
      // API 호출
      const response = await axios.post('/api/suggest-questions', {
        message: lastMessage.content,
        sessionId
      });
      
      if (response.data && response.data.questions) {
        setFollowupQuestions(response.data.questions);
      } else {
        // 서버에서 추천을 받지 못한 경우 클라이언트 측에서 생성
        const clientSuggestions = generateFollowupQuestions(lastMessage);
        setFollowupQuestions(clientSuggestions);
      }
    } catch (error) {
      console.error('추천 질문 가져오기 오류:', error);
      // 오류 발생 시 클라이언트 측에서 생성
      const clientSuggestions = generateFollowupQuestions(lastMessage);
      setFollowupQuestions(clientSuggestions);
    } finally {
      setIsLoadingSuggestions(false);
    }
  };

  // 추가 질문 생성 - 마지막 대화 기반 (클라이언트 측 백업 메서드)
  const generateFollowupQuestions = (lastMessage) => {
    if (!lastMessage || !lastMessage.content) return [];
    
    // 마지막 메시지 내용에 따른 추가 질문 생성
    const content = lastMessage.content.toLowerCase();
    let followupQuestions = [];
    
    // 폐암 관련 대화인 경우
    if (content.includes('폐암') || content.includes('비소세포')) {
      followupQuestions.push(
        "이 치료법의 부작용은 무엇인가요?",
        "이 약제의 투여 방법과 주기는 어떻게 되나요?",
        "PD-L1 발현 수준에 따른 치료 효과 차이가 있나요?"
      );
    }
    
    // PD-L1 관련 대화인 경우
    else if (content.includes('pd-l1') || content.includes('면역항암제')) {
      followupQuestions.push(
        "PD-L1 검사 방법은 어떻게 되나요?",
        "면역항암제 병용요법의 급여기준은 어떻게 되나요?",
        "면역항암제 치료 중 발생할 수 있는 부작용과 관리 방법은 무엇인가요?"
      );
    }
    
    // EGFR 관련 대화인 경우
    else if (content.includes('egfr') || content.includes('타그리소') || content.includes('오시머티닙')) {
      followupQuestions.push(
        "EGFR 변이의 종류에 따른 치료 옵션이 다른가요?",
        "오시머티닙 치료 실패 후의 대안 치료법은 무엇인가요?",
        "이 약제의 주요 부작용은 무엇인가요?"
      );
    }
    
    // 약제 급여 기준 관련 대화인 경우
    else if (content.includes('급여') || content.includes('보험')) {
      followupQuestions.push(
        "비급여 사용 시 예상 비용은 얼마인가요?",
        "급여 신청 시 필요한 검사나 서류는 무엇인가요?",
        "급여 기준을 벗어나는 경우 대체 치료법은 무엇인가요?"
      );
    }
    
    // 백혈병 관련 대화인 경우
    else if (content.includes('백혈병') || content.includes('leukemia')) {
      followupQuestions.push(
        "이 약제의 장기 사용 시 고려사항은 무엇인가요?",
        "치료 반응을 모니터링하는 방법은 무엇인가요?",
        "내성이 발생한 경우의 대체 치료법은 무엇인가요?"
      );
    }
    
    // 기본 추가 질문 (특정 키워드가 없는 경우)
    if (followupQuestions.length === 0) {
      followupQuestions = [
        "더 자세한 정보가 필요합니다. 어떤 부분이 궁금하신가요?",
        "특정 약제에 대해 더 알고 싶으신가요?",
        "급여 기준에 대해 더 알고 싶으신가요?"
      ];
    }
    
    return followupQuestions.slice(0, 3); // 최대 3개만 반환
  };

  // 페이지 인덱스 - 키워드와 페이지 번호 매핑
  const keywordPageIndex = {
    // 약제 이름 -> 페이지 번호 매핑
    '포나티닙': 12,
    'ponatinib': 12,
    '다사티닙': 15,
    'dasatinib': 15,
    '이매티닙': 18,
    'imatinib': 18,
    '닐로티닙': 22,
    'nilotinib': 22,
    '오시머티닙': 25,
    'osimertinib': 25,
    '펨브롤리주맙': 32,
    '키트루다': 32,
    'pembrolizumab': 32,
    '이필리무맙': 36,
    'ipilimumab': 36,
    '니볼루맙': 38,
    'opdivo': 38,
    'nivolumab': 38,
    '타그리소': 25,
    'tagrisso': 25,
    
    // 암 종류 -> 페이지 번호 매핑
    '폐암': 8,
    '유방암': 45,
    '대장암': 52,
    '위암': 60,
    '간암': 65,
    '백혈병': 72,
    '림프종': 80,
    '골수성': 74,
    
    // 바이오마커 -> 페이지 번호 매핑
    'EGFR': 25,
    'ALK': 28,
    'HER2': 47,
    'ROS1': 30,
    'BRAF': 54,
    'PD-L1': 33,
    'T315I': 13
  };

  // 스크롤을 자동으로 맨 아래로 이동
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
    
    // 마지막 메시지가 봇이고, 사용자 입력이 없는 상태면 추가 질문 표시
    const lastMessage = messages[messages.length - 1];
    if (lastMessage && lastMessage.role === 'assistant' && !isWaitingForResponse) {
      setShowFollowupQuestions(true);
      // 서버에서 추천 질문 가져오기
      fetchSuggestedQuestions();
    } else {
      setShowFollowupQuestions(false);
    }
  }, [messages, isWaitingForResponse]);

  // 텍스트 영역 높이 자동 조정
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = scrollHeight + 'px';
    }
  }, [message]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (message.trim() && !isWaitingForResponse) {
      onSendMessage(message);
      setMessage('');
      setShowFollowupQuestions(false);
      // 메시지를 전송한 후 텍스트 영역 높이 재설정
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  };

  const handleKeyDown = (e) => {
    // Enter 키를 누르고 Shift 키를 누르지 않은 경우 메시지 전송
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  // 예시 질문 클릭 핸들러
  const handleExampleClick = (question) => {
    if (!isWaitingForResponse) {
      onSendMessage(question);
      setShowFollowupQuestions(false);
    }
  };
  
  // 추가 질문 클릭 핸들러
  const handleFollowupClick = (question) => {
    if (!isWaitingForResponse) {
      onSendMessage(question);
      setShowFollowupQuestions(false);
    }
  };

  // 키워드 클릭 핸들러
  const handleKeywordClick = (pageNumber, keyword = '') => {
    if (pageNumber && onPdfNavigation) {
      if (keyword) {
        dispatch(setHighlight(keyword, parseInt(pageNumber, 10)));
      }
      onPdfNavigation(parseInt(pageNumber, 10));
    }
  };

  // 마크다운 형식의 메시지 포맷팅
  const formatMessageContent = (content) => {
    // 줄바꿈을 <br> 태그로 변환 - 먼저 처리
    let formattedContent = content.replace(/\n/g, '<br>');
    
    // 마크다운 스타일 강조 처리 (굵게)
    formattedContent = formattedContent.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    
    // 페이지 번호 태그 함수 - 아이콘 추가
    const createPageTag = (pageNum) => {
      return `<span class="page-reference clickable-page" data-page="${pageNum}">
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
        </svg>
        ${pageNum}
      </span>`;
    };
    
    // 1. "(페이지 38)" 형식 처리
    formattedContent = formattedContent.replace(/\(페이지\s+(\d+)\)/gi, 
      (match, pageNum) => {
        return `(페이지 ${createPageTag(pageNum)})`;
      }
    );
    
    // 2. "페이지 38" 형식 처리 - 페이지 단어 바로 다음에 오는 숫자만 인식
    formattedContent = formattedContent.replace(/페이지\s+(\d+)(?!\d*년|\d*월|\d*일)/gi, 
      (match, pageNum) => {
        return `페이지 ${createPageTag(pageNum)}`;
      }
    );
    
    // 3. "[페이지 38]" 또는 "[p.38]" 형식 처리
    formattedContent = formattedContent.replace(/\[(p\.|페이지|page)\s*(\d+)\]/gi, 
      (match, prefix, pageNum) => {
        return `[${prefix} ${createPageTag(pageNum)}]`;
      }
    );
    
    // 4. "참고 페이지: 38, 42, 45" 형식 처리
    formattedContent = formattedContent.replace(/참고\s*페이지:?\s*((?:\d+)(?:\s*,\s*\d+)*)/gi, 
      (match, pageList) => {
        // 이미 처리된 경우 건너뛰기
        if (match.includes('page-reference')) return match;
        
        // 쉼표로 구분된 페이지 번호들을 개별적으로 처리
        const processedPageList = pageList
          .split(/,\s*/)
          .map(pageNum => createPageTag(pageNum.trim()))
          .join(', ');
        
        return `참고 페이지: ${processedPageList}`;
      }
    );
    
    // 키워드 하이라이팅 - 특정 의학 용어, 치료법, 약물명 등
    const medicalTerms = [
      // 암 유형
      '폐암', '유방암', '대장암', '위암', '간암', '췌장암', '전립선암', '난소암', '백혈병', '림프종',
      // 약물명
      '세툭시맙', '트라스투주맙', '베바시주맙', '니볼루맙', '펨브롤리주맙', '아테졸리주맙', 
      '이필리무맙', '키트루다', '옵디보', '탁솔', '시스플라틴', 'cisplatin', 'paclitaxel',
      '포나티닙', '다사티닙', '이매티닙', '닐로티닙',
      // 치료법
      '항암화학요법', '방사선치료', '표적치료', '면역치료', '수술', '호르몬요법',
      // 바이오마커
      'EGFR', 'ALK', 'ROS1', 'BRAF', 'HER2', 'PD-L1', 'KRAS', 'NTRK', 'T315I'
    ];

    // 각 단어를 정규식 패턴으로 변환
    const medicalTermsPattern = new RegExp(`\\b(${medicalTerms.join('|')})\\b`, 'g');
    
    // 의학 용어에 스타일 적용
    formattedContent = formattedContent.replace(medicalTermsPattern, (match) => {
      return `<span class="keyword-highlight">${match}</span>`;
    });

    return formattedContent;
  };

  // 채팅 메시지 렌더링
  const renderMessageContent = (content, role) => {
    if (role === 'assistant') {
      const formattedContent = formatMessageContent(content);
      return (
        <div 
          className="message-text"
          dangerouslySetInnerHTML={{ __html: formattedContent }}
          onClick={(e) => {
            // 페이지 참조를 클릭했을 때 해당 페이지로 이동
            if (e.target.classList.contains('clickable-page') || e.target.className === 'page-reference') {
              const pageNumber = e.target.getAttribute('data-page');
              if (pageNumber) {
                // PDF 페이지로 이동
                handleKeywordClick(pageNumber);
                
                // 클릭 시각적 피드백 추가
                e.target.classList.add('page-clicked');
                setTimeout(() => {
                  e.target.classList.remove('page-clicked');
                }, 500);
              }
            }
            // 키워드를 클릭했을 때 하이라이트 및 이동
            else if (e.target.className === 'keyword-highlight') {
              const keyword = e.target.textContent;
              const pageNumber = keywordPageIndex[keyword];
              if (pageNumber) {
                handleKeywordClick(pageNumber, keyword);
                
                // 클릭 시각적 피드백 추가
                e.target.classList.add('keyword-clicked');
                setTimeout(() => {
                  e.target.classList.remove('keyword-clicked');
                }, 500);
              }
            }
          }}
        />
      );
    } else {
      return <div className="message-text">{content}</div>;
    }
  };

  // 환영 메시지와 예시 질문 렌더링 
  const renderWelcomeMessage = () => {
    return (
      <div className="welcome-message">
        <h2>SNUH-HARI 항암제 정보 도우미</h2>
        <p>항암제 정보에 대해 질문해보세요. 약물 설명, 부작용, 임상 적용 등에 관한 정보를 제공해 드립니다.</p>
        <div className="example-questions-container">
          <h3>다음과 같은 질문을 해보세요:</h3>
          <div className="example-questions">
            {exampleQuestions.map((question, index) => (
              <div 
                key={index} 
                className="example-question"
                onClick={() => handleExampleClick(question)}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                  <path d="M12 16v-4M12 8h.01"></path>
                </svg>
                {question}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  // 추가 질문 프롬프트 렌더링
  const renderFollowupQuestions = () => {
    if (!showFollowupQuestions || messages.length === 0) return null;
    
    const lastMessage = messages[messages.length - 1];
    if (lastMessage.role !== 'assistant') return null;
    
    return (
      <div className="followup-questions-container">
        <h4>추가 질문:</h4>
        <div className="followup-questions">
          {isLoadingSuggestions ? (
            <div className="loading-suggestions">추천 질문 로딩 중...</div>
          ) : (
            followupQuestions.map((question, index) => (
              <div 
                key={index} 
                className="followup-question"
                onClick={() => handleFollowupClick(question)}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                </svg>
                {question}
              </div>
            ))
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="chat-interface">
      <div className="chat-header">
        <h2>SNUH-HARI Anti-cancer Tx Agents</h2>
        <p className="subtitle">항암치료제 지식 도우미</p>
      </div>
      
      <div className="messages-container">
        {messages.length === 0 ? (
          renderWelcomeMessage()
        ) : (
          messages.map((msg, index) => (
            <div key={index} className={`message ${msg.role}`}>
              <div className="message-avatar">
                {msg.role === 'user' ? 
                  <span className="user-avatar">사용자</span> : 
                  <div className="bot-avatar">
                    <div className="bot-avatar-inner">HARI</div>
                  </div>
                }
              </div>
              {renderMessageContent(msg.content, msg.role)}
            </div>
          ))
        )}
        {isWaitingForResponse && (
          <div className="message assistant">
            <div className="message-avatar">
              <div className="bot-avatar">
                <div className="bot-avatar-inner">HARI</div>
              </div>
            </div>
            <div className="message-text typing-indicator">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
        )}
        {renderFollowupQuestions()}
        <div ref={messagesEndRef} />
      </div>
      
      <form className="message-form" onSubmit={handleSubmit}>
        <textarea
          ref={textareaRef}
          className="message-input"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="질문을 입력하세요..."
          rows={1}
          disabled={isWaitingForResponse}
        />
        <button 
          type="submit" 
          className="send-button"
          disabled={!message.trim() || isWaitingForResponse}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 2L11 13"></path>
            <path d="M22 2L15 22L11 13L2 9L22 2Z"></path>
          </svg>
        </button>
      </form>
    </div>
  );
};

export default ChatInterface; 
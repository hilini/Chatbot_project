import React from 'react';
import '../App.css';

const TitleHeader = ({ 
  onNewChat, 
  onToggleSessionControls, 
  showSessionControls, 
  onCloseSessionPanel,
  sessionHistory = [],
  onSwitchSession,
  currentSessionId
}) => {
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // 세션 날짜를 기준으로 내림차순 정렬 (최신순)
  const sortedSessions = [...sessionHistory].sort((a, b) => {
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  return (
    <header className="app-header">
      <div className="header-left">
        <div className="logo-container">
          <img 
            src="/snuh-logo.png" 
            alt="SNUH Logo" 
            className="header-logo"
            onError={(e) => {
              e.target.onerror = null;
              e.target.style.display = 'none';
            }}
          />
        </div>
        <div className="title-container">
          <h1 className="app-title">SNUH-HARI Anti-cancer Tx Agents</h1>
          <p className="app-subtitle">항암제 정보 및 요양급여 기준 검색</p>
        </div>
      </div>
      <div className="header-right">
        <div className="header-actions">
          <button 
            className="new-chat-button"
            onClick={onNewChat}
            title="새 대화 시작"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 5V19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M5 12H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className="button-text">새 대화</span>
          </button>
          
          <button 
            className={`session-toggle-button ${showSessionControls ? 'active' : ''}`}
            onClick={onToggleSessionControls}
            title="세션 관리"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" stroke="currentColor" strokeWidth="2"/>
              <line x1="9" y1="3" x2="9" y2="21" stroke="currentColor" strokeWidth="2"/>
              <line x1="12" y1="8" x2="16" y2="8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              <line x1="12" y1="12" x2="16" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              <line x1="12" y1="16" x2="16" y2="16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
          
          <button 
            className="help-button"
            title="도움말"
            onClick={() => alert('항암제 정보 및 요양급여 기준을 검색할 수 있는 챗봇입니다.\n\n- PDF 뷰어에서 페이지 이동이 가능합니다.\n- 키워드를 클릭하면 관련 페이지로 이동합니다.\n- 페이지 참조([12페이지])를 클릭하면 해당 페이지로 이동합니다.\n- 우측 상단의 버튼으로 스크롤/단일 페이지 모드를 전환할 수 있습니다.')}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              <line x1="12" y1="17" x2="12" y2="17" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
        
        {showSessionControls && (
          <div className="session-controls-panel">
            <div className="session-controls-header">
              <h3>대화 세션 관리</h3>
              <button 
                className="close-panel-button"
                onClick={onCloseSessionPanel}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>
            <div className="session-controls-content">
              <button 
                className="action-button"
                onClick={onNewChat}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 5V19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M5 12H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                새 대화 시작
              </button>
              
              {sortedSessions.length > 0 ? (
                <div className="session-list">
                  <h4 className="session-list-title">이전 대화 세션</h4>
                  {sortedSessions.map(session => (
                    <button 
                      key={session.sessionId} 
                      className={`session-item ${session.sessionId === currentSessionId ? 'active-session' : ''}`}
                      onClick={() => onSwitchSession(session.sessionId)}
                      disabled={session.sessionId === currentSessionId}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      <div className="session-info">
                        <span className="session-date">{formatDate(session.createdAt)}</span>
                        <span className="session-preview">
                          {session.preview || '대화 내용 없음'}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="no-sessions-message">
                  이전 세션이 없습니다.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </header>
  );
};

export default TitleHeader; 
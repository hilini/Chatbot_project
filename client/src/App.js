import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import ChatInterface from './components/ChatInterface';
import TitleHeader from './components/TitleHeader';
import { useDispatch, useSelector } from 'react-redux';
import { setHighlight, setPdfMode } from './store/actions';
import { setCurrentPage } from './store/actions';
import './App.css';
import FileList from './components/FileList';
import FilePreview from './components/FilePreview';

function App() {
  const [messages, setMessages] = useState([]);
  const [isWaitingForResponse, setIsWaitingForResponse] = useState(false);
  const [mode, setMode] = useState('chat'); // 'chat' or 'pdf'
  const [selectedFile, setSelectedFile] = useState(null);
  const [sessionHistory, setSessionHistory] = useState([]);
  const [currentSessionId, setCurrentSessionId] = useState(null);

  // 새 대화 시작 함수
  const handleNewChat = async () => {
    try {
      // 새 세션 생성
      const sessionResponse = await axios.post('/api/chat/sessions');
      const newSessionId = sessionResponse.data.sessionId;
      
      // 현재 세션을 히스토리에 저장 (메시지가 있는 경우)
      if (messages.length > 0 && currentSessionId) {
        const sessionPreview = messages[0]?.content?.substring(0, 50) || '대화 내용 없음';
        const currentSession = {
          sessionId: currentSessionId,
          createdAt: new Date().toISOString(),
          preview: sessionPreview
        };
        setSessionHistory(prev => [currentSession, ...prev]);
      }
      
      // 새 세션으로 전환
      setCurrentSessionId(newSessionId);
      localStorage.setItem('currentSessionId', newSessionId);
      setMessages([]); // 메시지 초기화
      
      console.log('새 대화가 시작되었습니다. 세션 ID:', newSessionId);
    } catch (error) {
      console.error('새 대화 시작 실패:', error);
      alert('새 대화를 시작할 수 없습니다. 다시 시도해주세요.');
    }
  };

  // 세션 전환 함수
  const handleSwitchSession = async (sessionId) => {
    try {
      // 해당 세션의 메시지 히스토리 가져오기
      const response = await axios.get(`/api/chat/sessions/${sessionId}/history`);
      setMessages(response.data.history || []);
      setCurrentSessionId(sessionId);
      localStorage.setItem('currentSessionId', sessionId);
      
      console.log('세션이 전환되었습니다. 세션 ID:', sessionId);
    } catch (error) {
      console.error('세션 전환 실패:', error);
      alert('세션을 전환할 수 없습니다. 다시 시도해주세요.');
    }
  };

  // 세션 컨트롤 토글 함수
  const [showSessionControls, setShowSessionControls] = useState(false);
  const handleToggleSessionControls = () => {
    setShowSessionControls(!showSessionControls);
  };

  // 세션 패널 닫기 함수
  const handleCloseSessionPanel = () => {
    setShowSessionControls(false);
  };

  const handleSendMessage = async (message) => {
    if (!message.trim()) return;

    // 사용자 메시지 추가
    const userMessage = { role: 'user', content: message };
    setMessages(prev => [...prev, userMessage]);
    setIsWaitingForResponse(true);

    try {
      // 세션 ID 가져오기 또는 생성
      let sessionId = localStorage.getItem('currentSessionId');
      if (!sessionId) {
        const sessionResponse = await axios.post('/api/chat/sessions');
        sessionId = sessionResponse.data.sessionId;
        localStorage.setItem('currentSessionId', sessionId);
        setCurrentSessionId(sessionId);
      }

      // 실제 챗봇 API 호출
      const response = await axios.post('/api/chat', {
        message: message,
        sessionId: sessionId,
        useRag: true
      });

      if (response.data && response.data.content) {
        const assistantMessage = { 
          role: 'assistant', 
          content: response.data.content,
          metadata: response.data.metadata
        };
        
        setMessages(prev => [...prev, assistantMessage]);
      } else {
        const errorMessage = { 
          role: 'assistant', 
          content: "죄송합니다. 응답을 생성할 수 없습니다." 
        };
        setMessages(prev => [...prev, errorMessage]);
      }
    } catch (error) {
      console.error('Error sending message:', error);
      const errorMessage = { 
        role: 'assistant', 
        content: "죄송합니다. 서버 연결에 문제가 있습니다." 
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsWaitingForResponse(false);
    }
  };

  return (
    <div className="app">
      <div className="app-header">
        <TitleHeader 
          onNewChat={handleNewChat}
          onToggleSessionControls={handleToggleSessionControls}
          showSessionControls={showSessionControls}
          onCloseSessionPanel={handleCloseSessionPanel}
          sessionHistory={sessionHistory}
          onSwitchSession={handleSwitchSession}
          currentSessionId={currentSessionId}
        />
        <div className="mode-toggle">
          <button 
            className={mode === 'chat' ? 'active' : ''} 
            onClick={() => setMode('chat')}
          >
            💬 채팅
          </button>
          <button 
            className={mode === 'pdf' ? 'active' : ''} 
            onClick={() => setMode('pdf')}
          >
            📁 파일 목록
          </button>
        </div>
      </div>
      
      {mode === 'chat' ? (
        <ChatInterface
          messages={messages}
          onSendMessage={handleSendMessage}
          isWaitingForResponse={isWaitingForResponse}
        />
      ) : (
        <div style={{display:'flex', minHeight:'calc(100vh - 80px)'}}>
          <div style={{flex:'0 0 350px', borderRight:'1px solid #eee', background:'#fafbfc'}}>
            <FileList onFileSelect={(file) => setSelectedFile(file)} />
          </div>
          <div style={{flex:'1 1 0', minWidth:0}}>
            <FilePreview file={selectedFile} />
          </div>
        </div>
      )}
    </div>
  );
}

export default App; 
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
        <TitleHeader />
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
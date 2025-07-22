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

  const handleSendMessage = async (message) => {
    if (!message.trim()) return;

    // 사용자 메시지 추가
    const userMessage = { role: 'user', content: message };
    setMessages(prev => [...prev, userMessage]);
    setIsWaitingForResponse(true);

    try {
      // 새로운 소스 추적 API 사용
      const response = await axios.post('/api/search', {
        query: message,
        limit: 5
      });

      if (response.data.success) {
        // 답변 생성 (실제로는 AI 모델을 사용해야 하지만, 지금은 검색 결과를 답변으로 사용)
        const results = response.data.results;
        const sources = response.data.sources;
        
        let answer = `검색 결과: "${message}"\n\n`;
        if (results.length > 0) {
          answer += results.map((result, index) => 
            `${index + 1}. ${result.content.slice(0, 200)}...`
          ).join('\n\n');
        } else {
          answer = "죄송합니다. 관련 정보를 찾을 수 없습니다.";
        }

        const assistantMessage = { 
          role: 'assistant', 
          content: answer,
          sources: sources // 소스 정보 추가
        };
        
        setMessages(prev => [...prev, assistantMessage]);
      } else {
        const errorMessage = { 
          role: 'assistant', 
          content: "죄송합니다. 검색 중 오류가 발생했습니다." 
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
            📄 PDF 뷰어
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
            <FileList onFileSelect={() => {}} />
          </div>
          <div style={{flex:'1 1 0', minWidth:0}}>
            <FilePreview file={null} />
          </div>
        </div>
      )}
    </div>
  );
}

export default App; 
import React, { useState } from 'react';
import './ChatMessage.css';

const ChatMessage = ({ message, sources, isUser = false }) => {
  const [showSources, setShowSources] = useState(false);

  if (isUser) {
    return (
      <div className="chat-message user-message">
        <div className="message-content">
          {message}
        </div>
      </div>
    );
  }

  return (
    <div className="chat-message assistant-message">
      <div className="message-content">
        {message}
      </div>
      
      {sources && sources.length > 0 && (
        <div className="sources-section">
          <button 
            className="sources-toggle"
            onClick={() => setShowSources(!showSources)}
          >
            📚 참고 소스 ({sources.length}개) {showSources ? '▼' : '▶'}
          </button>
          
          {showSources && (
            <div className="sources-list">
              {sources.map((source, index) => (
                <div key={index} className="source-item">
                  <div className="source-header">
                    <span className="source-number">#{index + 1}</span>
                    <span className="source-title">
                      {source.sectionTitle || source.source}
                    </span>
                    <span className="source-confidence">
                      신뢰도: {(source.confidence * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="source-details">
                    <span className="source-file">
                      📄 {source.filePath || '본문'}
                    </span>
                    <span className="source-post">
                      📋 게시글 #{source.postNo}
                    </span>
                    <span className="source-board">
                      📌 {source.boardId === 'HIRAA030023010000' ? '공고' : '항암화학요법'}
                    </span>
                  </div>
                  <div className="source-timestamp">
                    📅 {new Date(source.timestamp).toLocaleDateString('ko-KR')}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ChatMessage; 
import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
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
        <ReactMarkdown>{message}</ReactMarkdown>
      </div>
      
      {sources && sources.length > 0 && (
        <div className="sources-section">
          <button 
            className="sources-toggle"
            onClick={() => setShowSources(!showSources)}
          >
            📚 참고 문서 ({sources.length}개) {showSources ? '▼' : '▶'}
          </button>
          
          {showSources && (
            <div className="sources-list">
              {sources.map((source, index) => (
                <div key={index} className="source-item">
                  <div className="source-header">
                    <span className="source-number">#{index + 1}</span>
                    <span className="source-title">
                      {source.title || '제목 없음'}
                    </span>
                    {source.page && (
                      <span className="source-page">
                        📄 페이지 {source.page}
                      </span>
                    )}
                  </div>
                  <div className="source-details">
                    <span className="source-board">
                      📌 {source.boardId === 'HIRAA030023010000' ? '공고 게시판' : 
                          source.boardId === 'HIRAA030023030000' ? '항암화학요법 게시판' : 
                          source.boardId}
                    </span>
                    <span className="source-post">
                      📋 게시글 #{source.postNo}
                    </span>
                    {source.filename && (
                      <span className="source-file">
                        📄 {source.filename}
                      </span>
                    )}
                    <span className="source-type">
                      📝 {source.type === 'text' ? '텍스트' : '첨부파일'}
                    </span>
                    {source.score && (
                      <span className="source-score">
                        ⭐ {Math.round(source.score * 100)}%
                      </span>
                    )}
                  </div>
                  {source.content && (
                    <div className="source-content">
                      <div className="source-content-text">
                        {source.content}
                      </div>
                    </div>
                  )}
                  {source.filename && (
                    <div className="source-actions">
                      <a 
                        href={`/files/${encodeURIComponent(source.filename)}`} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="source-download"
                      >
                        📥 원본 파일 보기
                      </a>
                    </div>
                  )}
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
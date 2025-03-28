const express = require('express');
const cors = require('cors');
const path = require('path');

// Initialize Express app
const app = express();
const PORT = 3002; // 다른 포트 사용

// Middleware
app.use(cors());
app.use(express.json());

// Basic route for testing
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Minimal server is running' });
});

// 세션 목록 API
app.get('/api/chat/sessions', (req, res) => {
  res.json({ sessions: [] });
});

// 새 세션 생성 API
app.post('/api/chat/sessions', (req, res) => {
  const sessionId = Date.now().toString(36) + Math.random().toString(36).substring(2);
  res.json({
    sessionId,
    message: '새 채팅 세션이 생성되었습니다.'
  });
});

// Start the server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Minimal server running on port ${PORT}`);
}); 
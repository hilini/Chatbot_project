const express = require('express');
const app = express();
const PORT = 3003;

// Middleware
app.use(express.json());

// Basic route for testing
app.get('/api/health', (req, res) => {
  console.log('Health check requested');
  res.setHeader('Content-Type', 'text/plain');
  res.send('Server is healthy\n');
});

app.get('/', (req, res) => {
  console.log('Root requested');
  res.setHeader('Content-Type', 'text/plain');
  res.send('Hello World\n');
});

// 세션 관련 API
app.get('/api/chat/sessions', (req, res) => {
  console.log('Sessions list requested');
  res.json({ sessions: [
    { id: 'sample1', name: '예시 세션 1', updatedAt: new Date().toISOString() },
    { id: 'sample2', name: '예시 세션 2', updatedAt: new Date().toISOString() }
  ]});
});

app.post('/api/chat/sessions', (req, res) => {
  console.log('New session requested');
  const sessionId = Date.now().toString(36) + Math.random().toString(36).substring(2);
  res.json({
    sessionId,
    name: '새 채팅 세션',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
});

// Start the server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Simple server running on port ${PORT}`);
}); 
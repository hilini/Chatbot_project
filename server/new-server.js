/**
 * Basic server for anticancer chat
 * Without any LangChain or OpenAI dependencies
 */

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

// Initialize Express app
const app = express();
const PORT = 3001;

// Middleware
app.use(cors({
  origin: ['http://localhost:3000', 'http://10.10.10.103:3000'],
  methods: ['GET', 'POST'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Add a pre-flight route for CORS
app.options('*', cors());

// Basic route for testing
app.get('/api/health', (req, res) => {
  const response = { 
    status: 'ok', 
    message: 'Server is running',
    openaiAvailable: false
  };
  console.log('Health check requested. Responding with:', response);
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(response));
});

// Add a debug log middleware
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url} - ${req.ip}`);
  next();
});

// Route to serve the PDF file
app.get('/cancer_treatment_guidelines.pdf', (req, res) => {
  try {
    res.sendFile(path.join(__dirname, 'data', 'cancer_treatment_guidelines.pdf'));
  } catch (error) {
    console.error('Error serving PDF:', error);
    res.status(404).send('PDF not found');
  }
});

// Chat endpoint
app.post('/api/chat', async (req, res) => {
  try {
    console.log('Chat request received:', req.body);
    const { message } = req.body;
    
    if (!message) {
      console.warn('No message provided in request');
      return res.status(400).json({ 
        error: '메시지가 필요합니다.' // Message is required
      });
    }
    
    // This is a placeholder response until full implementation
    res.json({
      message: "현재 서버 연결이 준비 중입니다. 곧 실제 항암요법 정보를 제공할 예정입니다. MCP 도구를 사용하여 즉시 항암 치료 정보를 확인할 수 있습니다."
    });
  } catch (error) {
    console.error('Error in chat endpoint:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다. 다시 시도해 주세요.' });
  }
});

// Add API endpoint for chatbot that client is trying to access
app.post('/api/chatbot', async (req, res) => {
  try {
    console.log('Chatbot request received:', req.body);
    const { message } = req.body;
    
    if (!message) {
      console.warn('No message provided in request');
      return res.status(400).json({ 
        error: '메시지가 필요합니다.' // Message is required
      });
    }
    
    // This is a placeholder response 
    res.json({
      message: "현재 서버 연결이 준비 중입니다. 곧 실제 항암요법 정보를 제공할 예정입니다. MCP 도구를 사용하여 즉시 항암 치료 정보를 확인할 수 있습니다."
    });
  } catch (error) {
    console.error('Error in chatbot endpoint:', error.message, error.stack);
    res.status(500).json({ error: '서버 오류가 발생했습니다. 다시 시도해 주세요.' });
  }
});

// Start the server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Visit http://localhost:${PORT}/api/health to verify server is running`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

module.exports = app; 
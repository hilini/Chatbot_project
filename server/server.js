// ESM imports for Node.js
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import path from 'path';
import dotenv from 'dotenv';
import multer from 'multer';
import fs from 'fs';
import { sync, query, searchWithSources, VECTOR_DIR as VECTOR_STORE_DIR } from './utils/hira_data_module.js';
import configModule from '../config.js';
const config = configModule.default || configModule;

// ESM-compatible __dirname
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONTENT_DIR = path.join(__dirname, 'data', 'content');

// Import the config file
// const config = require('../config'); // This line is removed as per the new_code

// Comment out LangChain imports for now since they're not being used
// const { OpenAI } = require('@langchain/openai');
// const { OpenAIEmbeddings } = require('@langchain/openai');
// const { FaissStore } = require('@langchain/community/vectorstores/faiss');

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Initialize Express app
const app = express();
const PORT = config.server.port; // Using port from config

// Middleware
// Set up CORS with specific configuration from config file
app.use(cors({
  origin: config.server.cors.origins,
  methods: config.server.cors.methods,
  credentials: config.server.cors.credentials,
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// 첨부 원본 파일 열람 (hira_data_module → data/raw)
const RAW_DIR = path.resolve('./data/raw');
app.use('/files', express.static(RAW_DIR));

// SPA를 위한 모든 프론트엔드 라우트 처리
app.get('/*', (req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return next(); // API 라우트는 계속 진행
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Add a pre-flight route for CORS
app.options('*', cors());

// We'll skip OpenAI initialization for now since we're not using it
// Set a flag to indicate whether OpenAI is available from config
const openaiAvailable = config.ai.openaiAvailable;

// Import MCP Server functionality
// MCP Registry 관련 require 및 초기화 코드 주석 처리
// let mcpRegistry;
// try {
//   const { Registry } = require('@modelcontextprotocol/sdk/server');
//   mcpRegistry = new Registry();
  
  // Add new MCP tool for analyzing medical records
  app.post('/api/mcp/tools/analyzePatientRecord', async (req, res) => {
    try {
      const { patientRecord } = req.body;
      console.log('MCP tool request: analyzePatientRecord');
      
      if (!patientRecord || patientRecord.trim() === '') {
        return res.status(400).json({ error: '환자 의무기록이 필요합니다.' });
      }
      
      // Extract patient information from medical record using simple pattern matching
      // In a real implementation, this would use NLP or a more sophisticated algorithm
      const record = patientRecord.toLowerCase();
      
      // Extract cancer type
      let cancerType = null;
      const cancerTypes = ['폐암', '유방암', '대장암', '위암', '간암', '췌장암', '전립선암', '난소암'];
      for (const type of cancerTypes) {
        if (record.includes(type.toLowerCase())) {
          cancerType = type;
          break;
        }
      }
      
      // Extract stage
      let stage = null;
      const stagePatterns = [
        { pattern: /병기 (\d+)/i, group: 1 },
        { pattern: /(\d+)기/i, group: 1 },
        { pattern: /stage (\w+)/i, group: 1 },
        { pattern: /stage(\w+)/i, group: 1 }
      ];
      
      for (const { pattern, group } of stagePatterns) {
        const match = record.match(pattern);
        if (match && match[group]) {
          stage = match[group].toUpperCase();
          break;
        }
      }
      
      // Extract biomarkers
      const biomarkers = [];
      const biomarkerPatterns = [
        { name: 'EGFR', pattern: /egfr[\s\+\-]{1,2}(양성|변이|mutation)/i },
        { name: 'ALK', pattern: /alk[\s\+\-]{1,2}(양성|변이|fusion)/i },
        { name: 'HER2', pattern: /her2[\s\+\-]{1,2}(양성|변이)/i },
        { name: 'PD-L1', pattern: /pd-?l1[\s\+\-]{1,2}(양성|발현|expression)/i },
        { name: 'KRAS', pattern: /kras[\s\+\-]{1,2}(양성|변이|mutation)/i },
        { name: 'BRAF', pattern: /braf[\s\+\-]{1,2}(양성|변이|mutation)/i }
      ];
      
      for (const { name, pattern } of biomarkerPatterns) {
        if (pattern.test(record)) {
          biomarkers.push(`${name}+`);
        }
      }
      
      if (!cancerType || !stage) {
        return res.json({
          success: false,
          message: '의무기록에서 암종 또는 병기 정보를 찾을 수 없습니다. 더 자세한 의무기록을 입력해주세요.',
          extracted: {
            cancerType: cancerType || '정보 없음',
            stage: stage || '정보 없음',
            biomarkers: biomarkers.length > 0 ? biomarkers : ['정보 없음']
          }
        });
      }
      
      // Based on the extracted information, get recommended treatments
      const regimens = [];
      
      // Simulated RAG process - In a real implementation, this would query the PDF
      if (cancerType === '폐암') {
        if (stage === 'IV' || stage === '4') {
          if (biomarkers.some(b => b.includes('EGFR'))) {
            regimens.push({
              name: 'Osimertinib (타그리소)',
              description: 'EGFR 변이 양성 비소세포폐암에 대한 표적치료제',
              medications: ['Osimertinib'],
              coverageStatus: '급여',
              coverageInfo: 'EGFR 엑손 19 결실이나 엑손 21 L858R 치환 변이가 확인된 환자에게 급여 인정',
              evidenceLevel: 'A',
              reference: 'NCCN Guidelines Version 3.2023 Non-Small Cell Lung Cancer'
            });
          } else if (biomarkers.some(b => b.includes('ALK'))) {
            regimens.push({
              name: 'Alectinib (알레센자)',
              description: 'ALK 양성 비소세포폐암에 대한 표적치료제',
              medications: ['Alectinib'],
              coverageStatus: '급여',
              coverageInfo: 'ALK 양성이 확인된 국소 진행성 또는 전이성 비소세포폐암 환자에게 급여 인정',
              evidenceLevel: 'A',
              reference: 'NCCN Guidelines Version 3.2023 Non-Small Cell Lung Cancer'
            });
          } else if (biomarkers.some(b => b.includes('PD-L1'))) {
            regimens.push({
              name: 'Pembrolizumab (키트루다)',
              description: 'PD-L1 발현 비소세포폐암에 대한 면역항암제',
              medications: ['Pembrolizumab'],
              coverageStatus: '급여',
              coverageInfo: 'PD-L1 발현율 50% 이상인 전이성 비소세포폐암 환자의 1차 치료로 급여 인정',
              evidenceLevel: 'A',
              reference: 'NCCN Guidelines Version 3.2023 Non-Small Cell Lung Cancer'
            });
          } else {
            regimens.push({
              name: 'Pembrolizumab + Pemetrexed + Platinum (키트루다 + 알림타 + 시스플라틴/카보플라틴)',
              description: '전이성 비편평 비소세포폐암에 대한 1차 치료',
              medications: ['Pembrolizumab', 'Pemetrexed', 'Cisplatin/Carboplatin'],
              coverageStatus: '급여',
              coverageInfo: 'EGFR/ALK 변이가 없는 전이성 비편평 비소세포폐암 환자의 1차 치료로 급여 인정',
              evidenceLevel: 'A',
              reference: 'NCCN Guidelines Version 3.2023 Non-Small Cell Lung Cancer'
            });
          }
        } else if (stage === 'III' || stage === '3') {
          regimens.push({
            name: 'Concurrent Chemoradiation + Durvalumab',
            description: '절제 불가능한 3기 비소세포폐암에 대한 치료',
            medications: ['Cisplatin/Carboplatin', 'Etoposide', 'Radiation', 'Durvalumab'],
            coverageStatus: '급여',
            coverageInfo: '동시 항암방사선욕 종료 후 질병 진행이 없는 절제 불가능한 3기 비소세포폐암 환자에게 급여 인정',
            evidenceLevel: 'A',
            reference: 'NCCN Guidelines Version 3.2023 Non-Small Cell Lung Cancer'
          });
        }
      } else if (cancerType === '유방암') {
        if (biomarkers.some(b => b.includes('HER2'))) {
          regimens.push({
            name: 'Trastuzumab + Pertuzumab + Docetaxel + Carboplatin (허셉틴 + 퍼제타 + 도세탁셀 + 카보플라틴)',
            description: 'HER2 양성 유방암에 대한 표적치료',
            medications: ['Trastuzumab', 'Pertuzumab', 'Docetaxel', 'Carboplatin'],
            coverageStatus: '급여',
            coverageInfo: 'HER2 과발현이 확인된 수술 불가능한 국소 진행성 또는 전이성 유방암 환자에게 급여 인정',
            evidenceLevel: 'A',
            reference: 'NCCN Guidelines Version 1.2023 Breast Cancer'
          });
        } else if (record.includes('호르몬 수용체') || record.includes('er+') || record.includes('pr+')) {
          regimens.push({
            name: 'Anastrozole/Letrozole (아리미덱스/페마라)',
            description: '호르몬 수용체 양성 유방암에 대한 호르몬 치료',
            medications: ['Anastrozole/Letrozole'],
            coverageStatus: '급여',
            coverageInfo: '폐경 후 호르몬 수용체 양성 국소 진행성 또는 전이성 유방암 환자에게 급여 인정',
            evidenceLevel: 'A',
            reference: 'NCCN Guidelines Version 1.2023 Breast Cancer'
          });
        } else {
          regimens.push({
            name: 'AC-T (독소루비신 + 싸이클로포스파마이드 - 탁솔)',
            description: '삼중 음성 유방암에 대한 항암화학요법',
            medications: ['Doxorubicin', 'Cyclophosphamide', 'Paclitaxel'],
            coverageStatus: '급여',
            coverageInfo: '조기 또는 국소 진행성 삼중 음성 유방암 환자에게 급여 인정',
            evidenceLevel: 'A',
            reference: 'NCCN Guidelines Version 1.2023 Breast Cancer'
          });
        }
      }
      
      // If no specific regimens were found, provide a generic response
      if (regimens.length === 0) {
        regimens.push({
          name: `${cancerType} ${stage}기 표준 치료`,
          description: `${cancerType} ${stage}기에 대한 일반적인 치료 접근법`,
          medications: ['항암화학요법 및/또는 표적치료제'],
          coverageStatus: '개별 약제에 따라 다름',
          coverageInfo: '정확한 급여 기준은 건강보험심사평가원 홈페이지에서 확인하세요',
          evidenceLevel: 'B',
          reference: '한국임상종양학회 진료지침'
        });
      }
      
      // Return the analysis results
      res.json({
        success: true,
        patientInfo: {
          cancerType,
          stage,
          biomarkers: biomarkers.length > 0 ? biomarkers : ['정보 없음']
        },
        recommendedRegimens: regimens,
        notes: `${cancerType} ${stage}기 환자에 대한 치료 방법입니다. 실제 치료는 환자의 전체적인 상태와 의료진의 판단에 따라 달라질 수 있습니다.`
      });
    } catch (error) {
      console.error('Error in analyzePatientRecord endpoint:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // Add MCP endpoints
  app.post('/api/mcp/tools/getTreatmentRegimen', async (req, res) => {
    try {
      const { cancerType, stage, biomarkers } = req.body;
      console.log('MCP tool request: getTreatmentRegimen', { cancerType, stage, biomarkers });
      
      // This is a simulation - in a real implementation, this would use the MCP Registry
      // Similar to what we have in start-mcp.js
      const regimens = [];
      
      if (cancerType.toLowerCase().includes('lung')) {
        if (stage === 'IV' || stage === '4') {
          if (biomarkers && biomarkers.some(b => b.includes('EGFR'))) {
            regimens.push({
              name: 'Osimertinib (타그리소)',
              description: 'EGFR 변이 양성 비소세포폐암에 대한 표적치료제',
              medications: ['Osimertinib'],
              coverageStatus: '급여',
              evidenceLevel: 'A'
            });
          } else {
            regimens.push({
              name: 'Pembrolizumab + Pemetrexed + Platinum (키트루다 + 알림타 + 시스플라틴/카보플라틴)',
              description: '전이성 비편평 비소세포폐암에 대한 1차 치료',
              medications: ['Pembrolizumab', 'Pemetrexed', 'Cisplatin/Carboplatin'],
              coverageStatus: '급여',
              evidenceLevel: 'A'
            });
          }
        }
      } else if (cancerType.toLowerCase().includes('breast')) {
        if (biomarkers && biomarkers.some(b => b.includes('HER2+'))) {
          regimens.push({
            name: 'Trastuzumab + Pertuzumab + Docetaxel + Carboplatin (허셉틴 + 퍼제타 + 도세탁셀 + 카보플라틴)',
            description: 'HER2 양성 유방암에 대한 표적치료',
            medications: ['Trastuzumab', 'Pertuzumab', 'Docetaxel', 'Carboplatin'],
            coverageStatus: '급여',
            evidenceLevel: 'A'
          });
        }
      }
      
      // If no specific regimens were found, provide a generic response
      if (regimens.length === 0) {
        regimens.push({
          name: `${cancerType} ${stage}기 표준 치료`,
          description: `${cancerType} ${stage}기에 대한 일반적인 치료 접근법`,
          medications: ['항암화학요법 및/또는 표적치료제'],
          coverageStatus: '개별 약제에 따라 다름',
          evidenceLevel: 'B'
        });
      }
      
      res.json({
        recommendedRegimens: regimens,
        notes: `${cancerType} ${stage}기 환자에 대한 치료 방법입니다. 실제 치료는 환자의 전체적인 상태와 의료진의 판단에 따라 달라질 수 있습니다.`
      });
    } catch (error) {
      console.error('Error in getTreatmentRegimen endpoint:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
  app.post('/api/mcp/tools/checkTreatmentCoverage', async (req, res) => {
    try {
      const { treatmentName, cancerType } = req.body;
      console.log('MCP tool request: checkTreatmentCoverage', { treatmentName, cancerType });
      
      // Simulate coverage information
      const commonCoveredTreatments = {
        '키트루다': {
          coverageStatus: '급여',
          conditions: '비소세포폐암, 흑색종, 요로상피암 등 특정 조건에서 급여 인정',
          restrictions: 'PD-L1 발현율에 따른 제한이 있을 수 있음',
          alternativeTreatments: ['니볼루맙 (옵디보)', '아테졸리주맙 (티센트릭)']
        },
        '허셉틴': {
          coverageStatus: '급여',
          conditions: 'HER2 과발현 유방암, 위암 등에서 급여 인정',
          restrictions: 'HER2 양성 확인 필요',
          alternativeTreatments: []
        }
      };
      
      // Check for coverage status
      const lowerTreatmentName = treatmentName.toLowerCase();
      let coverageInfo = null;
      
      // Check exact matches first
      for (const [treatment, info] of Object.entries(commonCoveredTreatments)) {
        if (lowerTreatmentName.includes(treatment.toLowerCase())) {
          coverageInfo = {
            treatmentName: treatment,
            ...info,
            applicableToCancerType: info.conditions.toLowerCase().includes(cancerType.toLowerCase())
          };
          break;
        }
      }
      
      // If no match, provide a generic response
      if (!coverageInfo) {
        res.json({
          coverageStatus: '정보 없음',
          message: `${treatmentName}에 대한 급여 정보를 찾을 수 없습니다. 건강보험심사평가원 또는 담당 의료진에게 문의하세요.`,
          suggestedActions: [
            '건강보험심사평가원 웹사이트에서 최신 급여 기준 확인',
            '병원 원무과에 문의',
            '담당 의사에게 대체 치료 옵션 문의'
          ]
        });
        return;
      }
      
      res.json(coverageInfo);
    } catch (error) {
      console.error('Error in checkTreatmentCoverage endpoint:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
  app.post('/api/mcp/tools/findClinicalTrials', async (req, res) => {
    try {
      const { cancerType, location, patientDetails } = req.body;
      console.log('MCP tool request: findClinicalTrials', { cancerType, location, patientDetails });
      
      // Simulate clinical trial data
      const trials = [
        {
          id: 'NCT04123456',
          title: `${cancerType} 환자를 위한 ${Math.random() > 0.5 ? '면역항암제' : '표적치료제'} 임상시험`,
          phase: Math.floor(Math.random() * 3) + 1,
          locations: [location, '서울', '분당'],
          eligibility: {
            age: {
              min: 18,
              max: 75
            },
            cancerTypes: [cancerType],
            biomarkers: Math.random() > 0.7 ? ['PD-L1 양성'] : []
          },
          contactInfo: {
            name: '김연구 교수',
            phone: '02-123-4567',
            email: 'research@hospital.kr'
          },
          status: '모집 중'
        },
        {
          id: 'NCT04123457',
          title: `진행성 ${cancerType}에 대한 복합 치료법 임상시험`,
          phase: Math.floor(Math.random() * 3) + 1,
          locations: [location, '일산', '대전'],
          eligibility: {
            age: {
              min: 20,
              max: 80
            },
            cancerTypes: [cancerType],
            biomarkers: []
          },
          contactInfo: {
            name: '이임상 교수',
            phone: '02-765-4321',
            email: 'clinicaltrial@hospital.kr'
          },
          status: '모집 중'
        }
      ];
      
      // Filter by age if provided
      let filteredTrials = trials;
      if (patientDetails && patientDetails.age) {
        filteredTrials = trials.filter(trial => 
          patientDetails.age >= trial.eligibility.age.min && 
          patientDetails.age <= trial.eligibility.age.max
        );
      }
      
      res.json({
        trials: filteredTrials,
        totalCount: filteredTrials.length,
        message: `${cancerType} 관련 임상시험 ${filteredTrials.length}건을 찾았습니다.`,
        searchCriteria: {
          cancerType,
          location,
          patientAge: patientDetails?.age
        }
      });
    } catch (error) {
      console.error('Error in findClinicalTrials endpoint:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
  console.log('MCP endpoints registered successfully');
// } catch (error) {
//   console.warn('Failed to initialize MCP Registry:', error.message);
//   mcpRegistry = null;
// }

// Basic route for testing
app.get('/api/health', (req, res) => {
  const healthInfo = { 
    status: 'ok', 
    message: 'Server is running',
    openaiAvailable: openaiAvailable,
    serverTime: new Date().toISOString(),
    nodeVersion: process.version,
    env: process.env.NODE_ENV || 'development',
    ip: req.ip,
    configLoaded: true,
    mcpEnabled: config.mcp.enabled
  };
  
  console.log('Health check requested from', req.ip, '- Responding with:', healthInfo);
  
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(healthInfo));
});

// Add a debug log middleware
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url} - ${req.ip}`);
  next();
});

// Serve the cancer treatment guidelines PDF file
app.get('/cancer_treatment_guidelines.pdf', (req, res) => {
  const pdfPath = path.join(__dirname, 'data', 'cancer_treatment_guidelines.pdf');
  res.sendFile(pdfPath);
});

// multer 설정
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB 제한
  },
  fileFilter: function (req, file, cb) {
    if (file.mimetype !== 'application/pdf') {
      return cb(new Error('PDF 파일만 업로드 가능합니다'), false);
    }
    cb(null, true);
  }
});

// PDF 업로드 및 처리 라우트
app.post('/api/upload/pdf', upload.single('pdfFile'), async (req, res) => {
  return res.status(501).json({ error: 'PDF 수동 업로드는 지원되지 않습니다.' });
});

// search/documents 엔드포인트 수정 - 페이지 정보 반환
app.post('/api/search/documents', async (req, res) => {
    try {
      const { query: searchText } = req.body;
    
    if (!searchText || searchText.trim() === '') {
      return res.status(400).json({ error: '검색어가 필요합니다.' });
    }
    
    console.log(`문서 검색 요청: \"${searchText}\", 네임스페이스: ${NAMESPACE}`);
    
    // 유사한 문서 검색
    const results = await query(searchText); 
    
    // 검색 결과 로깅 - 페이지 번호 확인
    console.log(`검색 결과: ${results.length}개 문서 발견`);
    results.forEach((doc, idx) => {
      console.log(`[${idx}] 물리적 페이지: ${doc.metadata.page || '정보 없음'}, 문서 내 페이지: ${doc.metadata.documentPage || '정보 없음'}, 내용 길이: ${doc.pageContent.length}`);
    });
    
    // 응답할 문서 형식 변환 (페이지 정보 포함)
    const documents = results.map(doc => ({
      content: doc.pageContent,
      metadata: doc.metadata,
      page: doc.metadata.page || null,                // 물리적 페이지 번호
      documentPage: doc.metadata.documentPage || null // 문서 내 페이지 번호(좌하단 페이지 번호)
    }));
    
    return res.json({ documents });
  } catch (error) {
    console.error('문서 검색 오류:', error);
    return res.status(500).json({ error: error.message });
  }
});

// 새로운 API 엔드포인트: 네임스페이스 정보 조회 (페이지 수 포함)
// app.get('/api/namespaces/:namespace/info', async (req, res) => {
//   try {
//     const { namespace } = req.params;
//     const pageCount = getNamespacePageCount(namespace);
    
//     return res.json({
//       namespace,
//       pageCount,
//       isAvailable: pageCount > 0
//     });
//   } catch (error) {
//     console.error('네임스페이스 정보 조회 오류:', error);
//     return res.status(500).json({ error: error.message });
//   }
// });

// 채팅 세션 관리를 위한 메모리 저장소
const chatSessions = {};

// 채팅 엔드포인트 수정 - 세션 관리 추가
app.post('/api/chat', async (req, res) => {
  try {
    // 요청에서 파라미터 추출
    const { message, sessionId, useRag = true } = req.body;
    
    if (!message || message.trim() === '') {
      return res.status(400).json({ error: '메시지가 필요합니다.' });
    }
    
    // 세션 확인
    if (!chatSessions[sessionId]) {
      chatSessions[sessionId] = {
        history: [],
        createdAt: new Date(),
        lastActivity: new Date()
      };
    } else {
      // 세션 활동 시간 업데이트
      chatSessions[sessionId].lastActivity = new Date();
    }
    
    // 히스토리에 사용자 메시지 추가
    chatSessions[sessionId].history.push({
      role: 'user',
      content: message
    });
    
    // RAG 문서 추출
    let contextDocs = [];
    let sourcePages = [];
    let results = [];  // 상위 스코프로 이동하여 메타데이터 접근에 사용
    
    
    if (useRag) {
      try {
        // 관련 문서 검색
        results = await query(message);
        
        // 컨텍스트 구성 및 페이지 번호 추출
        contextDocs = results.map(doc => doc.pageContent);
        
        // 문서 내 페이지 번호(documentPage)를 우선적으로 사용하고, 없으면 물리적 페이지 번호(page) 사용
        sourcePages = results.map(doc => doc.metadata.documentPage || doc.metadata.page || null)
                             .filter(page => page !== null);

        const isApproved = results.some(r => /허가|식품의약품안전처/.test(r.pageContent));
        const isNotified = results.some(r => /급여|고시|요양급여/.test(r.pageContent));
        let reimbursement;
        if (isApproved && isNotified) reimbursement = '급여';
        else if (isApproved)          reimbursement = '비급여';
        else                           reimbursement = '임의 비급여';

        // 판정 근거 페이지 추출 (최대 3개)
        const evidencePages = results
          .filter(r => /허가|급여|고시/.test(r.pageContent))
          .map(r => r.metadata.documentPage || r.metadata.page)
          .slice(0, 3);
        
        console.log("추출된 소스 페이지(문서 내 페이지 번호):", sourcePages);
        if (sourcePages.length > 0) {
          console.log(`${sourcePages.length}개의 페이지 참조가 발견되었습니다: ${sourcePages.join(', ')}`);
        } else {
          console.log("페이지 참조가 없습니다");
        }
      } catch (error) {
        console.warn('RAG 문서 검색 오류:', error);
      }
    }

    // AI 모델 초기화
    let ai;
    let modelName;
    
    if (config.ai.provider === 'openai' || config.ai.openaiAvailable) {
      const { ChatOpenAI } = require('@langchain/openai');
      try {
        // 기본 모델 설정
        modelName = config.ai.openaiModel || 'gpt-3.5-turbo';
        console.log(`OpenAI 모델 초기화 시도: ${modelName}`);
        
        ai = new ChatOpenAI({
          openAIApiKey: process.env.OPENAI_API_KEY,
          modelName: modelName,
          temperature: 0.2,
        });
      } catch (error) {
        // 모델 로드 실패 시 fallback
        console.warn(`모델 ${modelName} 초기화 실패, gpt-3.5-turbo로 fallback: ${error.message}`);
        modelName = 'gpt-3.5-turbo';
        ai = new ChatOpenAI({
          openAIApiKey: process.env.OPENAI_API_KEY,
          modelName: modelName,
          temperature: 0.2,
        });
      }
    } else {
      // Default to OpenAI if provider is missing or not supported
      const { ChatOpenAI } = require('@langchain/openai');
      modelName = 'gpt-3.5-turbo';
      console.log(`기본 OpenAI 모델 사용: ${modelName}`);
      ai = new ChatOpenAI({
        openAIApiKey: process.env.OPENAI_API_KEY,
        modelName: modelName,
        temperature: 0.2,
      });
    }
    
    // 프롬프트 구성
    let systemPrompt = `당신은 항암제 정보와 요양급여 기준에 대한 전문적인 지식을 가진 의료 상담 챗봇입니다. 
    사용자의 질문에 명확하고 정확하게 답변해 주세요.
    
    한국어로 응답해야 합니다.
    
    응답 서식에 관한 중요 가이드라인:
    1. 가독성을 높이기 위해 적절한 줄바꿈을 사용하세요. 단락 사이에는 빈 줄을 추가하세요.
    2. 응답이 긴 경우, 소제목이나 구분선을 사용하여 주제별로 구분하세요.
    3. 계층적 정보를 제공할 때는 다음과 같은 포맷을 사용하세요:
       - 암종 정보 (대분류)
       - 치료법 (중분류)
       - 투여단계/방법 (소분류)
       - 상세 내용 (약제 정보, 급여기준 등)
    4. 중요한 키워드나 약품명은 **강조 표시**를 사용하세요.
    5. 가능한 경우, 정보를 항목별로 구분하여 나열하세요.
    
    응답 구조 가이드라인:
    1. 첫 문단에서는 질문에 대한 간략한 답변을 제공하세요. (3-4줄 이내)
    2. 이후 상세 정보를 구조화된 형식으로 제공하세요.
    3. 모든 응답은 다음 구조를 따라주세요:
       a. 요약 답변 (간결하게)
       b. 상세 정보 (구조화하여)
       c. 관련 참고사항 (필요시)
    
    페이지 참조 규칙:
    1. 각 정보를 제공할 때마다 출처 페이지를 함께 명시하세요. 예:
       - "펨브롤리주맙은 PD-L1 발현 비율 ≥ 50%인 경우 1차 치료로 사용합니다(페이지 32)."
       - "다사티닙의 권장 용량은 100mg 1일 1회입니다(페이지 15)."
    2. 각 단락이나 주요 정보 블록 뒤에 페이지 번호를 넣어주세요.
    3. 본문 중간에 페이지 참조를 자연스럽게 포함시키세요.
    4. 마지막에 단순히 페이지 번호만 나열하지 마세요. 대신 정보를 제공할 때 해당 페이지 번호를 항상 함께 언급하세요.
    
    참고 자료가 제공될 경우:
    1. 해당 자료에 있는 내용만 활용하여 답변하세요.
    2. 자료에 확실히 언급되지 않은 내용에 대해서는 추측하지 마세요.
    3. 각 정보 청크마다 그 정보가 어느 페이지에서 왔는지 명시하세요. 
       - 예: "EGFR 변이 폐암에는 오시머티닙이 1차 치료제로 권장됩니다(페이지 25)."
    4. 자료에 계층적 정보(암종, 치료법, 투여단계 등)가 포함되어 있다면 이를 명확히 구분하여 제시하세요.
    
    주요 약제에 대한 보험 급여 기준이나 항암 치료 정보는 최대한 상세히 안내해 주세요.
    요약이 필요할 경우 핵심 정보 위주로 요약하되, 정확성을 유지하세요.`;
    
    let userPrompt = message;
    
    // 참고 문서가 있으면 프롬프트에 추가
    if (contextDocs.length > 0) {
      // 각 문서에 대한 계층적 정보를 추출
      let hierarchicalInfo = [];
      
      for (let i = 0; i < contextDocs.length; i++) {
        const doc = contextDocs[i];
        // 문서의 메타데이터 추출 - 이미 검색 시점에 메타데이터가 포함되어 있다고 가정
        const metadata = results[i]?.metadata || {};
        const page = metadata.documentPage || metadata.page || 'unknown';
        
        let prefix = "";
        if (metadata.cancerType) prefix += `암종: ${metadata.cancerType}\n`;
        if (metadata.treatmentMethod) prefix += `치료법: ${metadata.treatmentMethod}\n`;
        if (metadata.administrationStage) prefix += `투여단계: ${metadata.administrationStage}\n`;
        
        hierarchicalInfo.push(prefix ? `${prefix}\n페이지 ${page}의 정보:\n${doc}` : `페이지 ${page}의 정보:\n${doc}`);
      }
      
      userPrompt = `${message}\n\n참고 자료:\n${hierarchicalInfo.join('\n\n')}`;
    }
    
    // ChatOpenAI에 맞게 메시지 형식 구성
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];
    
    // AI를 사용하여 답변 생성
    let response;
    try {
      const aiResponse = await ai.invoke(messages);
      response = aiResponse.content;
      console.log(`[채팅] 응답 성공, 길이: ${response.length} 자`);
      response += `
판정 결과: **${reimbursement}**  
(근거 페이지: ${evidencePages.join(', ')})`;
    } catch (error) {
      console.error(`[채팅] 응답 오류 (${modelName}): ${error.message}`);
      
      // 지정한 모델이 실패하면 gpt-3.5-turbo로 재시도
      if (modelName !== 'gpt-3.5-turbo') {
        console.log('[채팅] gpt-3.5-turbo로 재시도합니다.');
        try {
          const fallbackAi = new ChatOpenAI({
            openAIApiKey: process.env.OPENAI_API_KEY,
            modelName: 'gpt-3.5-turbo',
            temperature: 0.2,
          });
          
          const fallbackResponse = await fallbackAi.invoke(messages);
          response = fallbackResponse.content;
          console.log(`[채팅] 재시도 성공, 길이: ${response.length} 자`);
          modelName = 'gpt-3.5-turbo'; // 응답에 표시할 모델명 업데이트
        } catch (fallbackError) {
          console.error(`[채팅] 재시도 실패: ${fallbackError.message}`);
          throw error; // 원래 오류를 다시 던짐
        }
      } else {
        throw error; // 이미 기본 모델이면 오류를 그대로 던짐
      }
    }
    
    // 페이지 정보가 응답에 충분히 포함되어 있는지 확인하고, 없으면 추가
    let responseWithPageInfo = response;
    if (sourcePages.length > 0 && !response.toLowerCase().includes('페이지')) {
      // 페이지 정보를 자연스럽게 응답 본문 중간에 삽입
      const sentences = response.split(/(?<=[.!?])\s+/);
      const pageCount = sourcePages.length;
      const insertPoints = Math.min(sentences.length - 1, pageCount * 2);
      
      // 최소 3개 문장마다 페이지 번호 삽입
      for (let i = 0; i < insertPoints; i += 3) {
        const pageIndex = Math.min(i / 2, pageCount - 1);
        const page = sourcePages[pageIndex];
        sentences[i] += ` (페이지 ${page})`;
      }
      
      responseWithPageInfo = sentences.join(' ');
    }
    
    // 히스토리에 AI 응답 추가
    chatSessions[sessionId].history.push({
      role: 'assistant',
      content: responseWithPageInfo,
      metadata: {
        sourcePages,
        timestamp: new Date().toISOString()
      }
    });
    
    // 응답 반환
    return res.json({
      role: 'assistant',
      content: responseWithPageInfo,
      metadata: {
        sourcePages,
        modelName,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('채팅 요청 오류:', error);
    return res.status(500).json({
      role: 'assistant',
      content: '죄송합니다. 응답을 생성하는 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.'
    });
  }
});

// 채팅 세션 관리 엔드포인트

// 새 세션 생성
app.post('/api/chat/sessions', (req, res) => {
  const sessionId = Date.now().toString(36) + Math.random().toString(36).substring(2);
  
  chatSessions[sessionId] = {
    history: [],
    createdAt: new Date(),
    lastActivity: new Date()
  };
  
  return res.json({
    sessionId,
    message: '새 채팅 세션이 생성되었습니다.'
  });
});

// 세션 정보 조회
app.get('/api/chat/sessions/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  
  if (!chatSessions[sessionId]) {
    return res.status(404).json({
      error: '세션을 찾을 수 없습니다.'
    });
  }
  
  return res.json({
    sessionId,
    messageCount: chatSessions[sessionId].history.length,
    createdAt: chatSessions[sessionId].createdAt,
    lastActivity: chatSessions[sessionId].lastActivity
  });
});

// 세션 히스토리 조회
app.get('/api/chat/sessions/:sessionId/history', (req, res) => {
  const { sessionId } = req.params;
  
  if (!chatSessions[sessionId]) {
    return res.status(404).json({
      error: '세션을 찾을 수 없습니다.'
    });
  }
  
  return res.json({
    sessionId,
    history: chatSessions[sessionId].history
  });
});

// 세션 삭제
app.delete('/api/chat/sessions/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  
  if (chatSessions[sessionId]) {
    delete chatSessions[sessionId];
    return res.json({
      message: '세션이 삭제되었습니다.'
    });
  } else {
    return res.status(404).json({
      error: '세션을 찾을 수 없습니다.'
    });
  }
});

// 오래된 세션 정리 (1시간마다 실행)
setInterval(() => {
  const now = new Date();
  const sessionTimeout = 24 * 60 * 60 * 1000; // 24시간
  
  Object.keys(chatSessions).forEach(sessionId => {
    const session = chatSessions[sessionId];
    const inactiveTime = now - new Date(session.lastActivity);
    
    if (inactiveTime > sessionTimeout) {
      delete chatSessions[sessionId];
      console.log(`비활성 세션 삭제: ${sessionId}`);
    }
  });
}, 60 * 60 * 1000); // 1시간마다 실행

// 세션 목록 조회
app.get('/api/chat/sessions', (req, res) => {
  const sessionsList = Object.keys(chatSessions).map(sessionId => {
    const session = chatSessions[sessionId];
    const lastMessage = session.history.length > 0 
      ? session.history[session.history.length - 1] 
      : null;
    
    return {
      sessionId,
      createdAt: session.createdAt,
      lastActivity: session.lastActivity,
      messageCount: session.history.length,
      preview: lastMessage ? lastMessage.content.substring(0, 50) + (lastMessage.content.length > 50 ? '...' : '') : ''
    };
  }).sort((a, b) => new Date(b.lastActivity) - new Date(a.lastActivity));
  
  return res.json({
    sessions: sessionsList
  });
});

// 새로운 API 엔드포인트: PDF 다시 처리하기
// app.post('/api/reprocess-pdf', async (req, res) => {
//   try {
//     const { pdfPath, title, author, category, namespace } = req.body;
    
//     // PDF 파일 경로 확인
//     const fullPath = path.resolve(__dirname, '..', pdfPath);
    
//     if (!fs.existsSync(fullPath)) {
//       return res.status(404).json({
//         success: false,
//         message: `파일이 존재하지 않습니다: ${pdfPath}`
//       });
//     }
    
//     console.log(`PDF 재처리 시작: ${fullPath}`);
    
//     // 메타데이터 준비
//     const metadata = {
//       title: title || path.basename(fullPath, '.pdf'),
//       author: author || '미상',
//       category: category || '암 치료',
//       uploadDate: new Date().toISOString(),
//       fileName: path.basename(fullPath),
//       namespace: namespace || NAMESPACE
//     };
    
//     // 기존 벡터 스토어 삭제
//     const storeDir = path.join(VECTOR_STORE_DIR, namespace || NAMESPACE);
//     if (fs.existsSync(storeDir)) {
//       console.log(`기존 벡터 스토어 삭제: ${storeDir}`);
//       if (fs.existsSync(path.join(storeDir, 'faiss.index'))) {
//         fs.unlinkSync(path.join(storeDir, 'faiss.index'));
//       }
//       if (fs.existsSync(path.join(storeDir, 'docstore.json'))) {
//         fs.unlinkSync(path.join(storeDir, 'docstore.json'));
//       }
//     }
    
//     // PDF 처리 및 벡터화
//     const result = await processPDF(fullPath, metadata);
    
//     if (result.success) {
//       return res.status(200).json({
//         success: true,
//         message: `PDF 파일이 성공적으로 재처리되었습니다.`,
//         file: path.basename(fullPath),
//         documentCount: result.documentCount,
//         pageCount: result.pageCount,
//         metadata
//       });
//     } else {
//       return res.status(500).json({
//         success: false,
//         message: '파일 처리 중 오류가 발생했습니다.',
//         error: result.error
//       });
//     }
//   } catch (error) {
//     console.error('PDF 재처리 오류:', error);
//     return res.status(500).json({
//       success: false,
//       message: '서버 오류가 발생했습니다.',
//       error: error.message
//     });
//   }
// });

// 관련 질문 추천 API 엔드포인트
app.post('/api/suggest-questions', async (req, res) => {
  try {
    const { message, sessionId } = req.body;
    
    if (!message) {
      return res.status(400).json({
        error: '메시지 내용이 필요합니다.'
      });
    }
    
    // 주제별 관련 질문 패턴 정의
    const questionPatterns = {
      // 폐암 관련 추가 질문
      lung: [
        "비소세포폐암의 병기별 치료 옵션은 무엇인가요?",
        "폐암에서 EGFR/ALK/ROS1 검사의 중요성은 무엇인가요?",
        "폐암 환자의 면역항암제 치료에서 PD-L1 발현의 의미는 무엇인가요?",
        "소세포폐암과 비소세포폐암의 치료법 차이는 무엇인가요?",
        "비소세포폐암 환자에게 흔히 사용되는 표적치료제는 무엇이 있나요?"
      ],
      
      // 면역항암제 관련 추가 질문
      immunotherapy: [
        "면역항암제 치료 시 발생할 수 있는 자가면역 부작용은 무엇인가요?",
        "면역항암제와 표적치료제의 차이점은 무엇인가요?",
        "면역항암제 병용요법의 장점과 단점은 무엇인가요?",
        "면역항암제 치료 중 효과를 평가하는 방법은 무엇인가요?",
        "면역항암제 치료에 적합한 환자 선택 기준은 무엇인가요?"
      ],
      
      // 표적치료제 관련 추가 질문
      targetedTherapy: [
        "표적치료제 사용 시 주기적으로 확인해야 할 검사는 무엇인가요?",
        "표적치료제 치료 실패 후의 대안 치료법은 무엇인가요?",
        "표적치료제 내성이 발생하는 기전은 무엇인가요?",
        "표적치료제의 주요 부작용과 관리 방법은 무엇인가요?",
        "표적치료제와 기존 항암화학요법을 병용하는 경우의 장단점은 무엇인가요?"
      ],
      
      // 급여기준 관련 추가 질문
      reimbursement: [
        "항암제 급여 신청 시 필요한 검사나 서류는 무엇인가요?",
        "비급여 사용 시 예상 비용은 얼마인가요?",
        "급여 인정 기간과 연장 기준은 어떻게 되나요?",
        "급여 기준을 벗어나는 경우 대체 치료법은 무엇인가요?",
        "환자 개인부담금을 줄이는 방법은 무엇이 있나요?"
      ],
      
      // 항암화학요법 관련 추가 질문
      chemotherapy: [
        "항암화학요법의 주요 부작용과 관리 방법은 무엇인가요?",
        "항암제 투여 전후 주의사항은 무엇인가요?",
        "항암화학요법 중 영양 관리는 어떻게 해야 하나요?",
        "항암화학요법의 효과를 높이는 방법은 무엇인가요?",
        "항암화학요법과 방사선 치료를 병행하는 경우의 장단점은 무엇인가요?"
      ]
    };
    
    // 주제 키워드 정의 - 각 카테고리에 해당하는 키워드
    const topicKeywords = {
      lung: ['폐암', '비소세포', '소세포', 'lung', 'nsclc', 'sclc'],
      immunotherapy: ['면역항암', '면역치료', 'pd-1', 'pd-l1', '키트루다', '옵디보', '티센트릭', 'pembrolizumab', 'nivolumab', 'atezolizumab'],
      targetedTherapy: ['표적치료', 'egfr', 'alk', 'ros1', 'braf', '타그리소', '알레센자', 'osimertinib', 'alectinib'],
      reimbursement: ['급여', '보험', '비용', '본인부담', '인정기준'],
      chemotherapy: ['항암화학', '항암제', '화학요법', '백금기반', '시스플라틴', '카보플라틴']
    };
    
    // 이전 대화 내용 가져오기
    let messageHistory = [];
    if (sessionId && chatSessions[sessionId] && chatSessions[sessionId].history) {
      messageHistory = chatSessions[sessionId].history;
    }
    
    // 마지막 3개의 메시지만 분석 (더 많은 컨텍스트가 필요한 경우 늘릴 수 있음)
    const recentMessages = messageHistory.slice(-3);
    const allText = [message, ...recentMessages.map(msg => msg.content)].join(' ').toLowerCase();
    
    // 텍스트에서 주제 식별
    let detectedTopics = [];
    for (const [topic, keywords] of Object.entries(topicKeywords)) {
      if (keywords.some(keyword => allText.includes(keyword.toLowerCase()))) {
        detectedTopics.push(topic);
      }
    }
    
    // 주제가 감지되지 않은 경우 기본 주제 제공
    if (detectedTopics.length === 0) {
      detectedTopics = ['reimbursement', 'chemotherapy'];
    }
    
    // 최대 2개의 주제만 선택
    if (detectedTopics.length > 2) {
      detectedTopics = detectedTopics.slice(0, 2);
    }
    
    // 각 주제에서 질문 선택
    let suggestedQuestions = [];
    for (const topic of detectedTopics) {
      const topicQuestions = questionPatterns[topic];
      
      // 각 주제당 2개의 질문 무작위 선택
      const selectedQuestions = topicQuestions
        .sort(() => 0.5 - Math.random())
        .slice(0, 2);
      
      suggestedQuestions = [...suggestedQuestions, ...selectedQuestions];
    }
    
    // 중복 제거 및 최대 3개 질문으로 제한
    suggestedQuestions = [...new Set(suggestedQuestions)].slice(0, 3);
    
    // 항상 일반적인 질문 하나 추가
    const generalQuestions = [
      "이 약제의 주요 부작용은 무엇인가요?",
      "이 치료법의 급여 인정 기준은 어떻게 되나요?",
      "치료 반응을 모니터링하는 방법은 무엇인가요?",
      "환자 관리에서 가장 중요한 점은 무엇인가요?",
      "관련 논문이나 가이드라인이 있나요?"
    ];
    
    // 일반 질문 중 하나를 무작위로 선택
    const generalQuestion = generalQuestions[Math.floor(Math.random() * generalQuestions.length)];
    
    // 아직 3개가 안 되면 일반 질문 추가
    if (suggestedQuestions.length < 3) {
      suggestedQuestions.push(generalQuestion);
    }
    
    // 최종 질문 목록 반환
    return res.json({
      questions: suggestedQuestions
    });
    
  } catch (error) {
    console.error('질문 추천 오류:', error);
    return res.status(500).json({
      error: '질문 추천 중 오류가 발생했습니다.'
    });
  }
});

// API: 소스 추적 검색
app.post('/api/search', async (req, res) => {
  try {
    const { query, limit = 5 } = req.body;
    
    if (!query) {
      return res.status(400).json({ 
        error: '검색어를 입력해주세요.' 
      });
    }

    const { results, sources } = await searchWithSources(query, limit);
    
    res.json({
      success: true,
      query,
      results: results.map(r => ({
        content: r.content,
        score: r.score,
        sourceInfo: r.sourceInfo
      })),
      sources,
      totalResults: results.length,
      totalSources: sources.length
    });
    
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ 
      error: '검색 중 오류가 발생했습니다.' 
    });
  }
});

// API: List available files in content directory
app.get('/api/files', (req, res) => {
  fs.readdir(CONTENT_DIR, (err, files) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to read content directory' });
    }
    // Filter only files (not directories)
    const fileList = files.filter(f => fs.statSync(path.join(CONTENT_DIR, f)).isFile())
      .map(f => {
        const stat = fs.statSync(path.join(CONTENT_DIR, f));
        return {
          filename: f,
          size: stat.size,
          mtime: stat.mtime
        };
      });
    res.json({ files: fileList });
  });
});


(async () => {
  try {
    await sync();                  // 새 글 있을 때만 임베딩
  } catch (e) {
    console.warn('[SYNC] 초기 동기화 실패:', e.message);
  }
})();


// Start the server
app.listen(PORT, config.server.host, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Visit http://localhost:${PORT}/api/health to verify server is running`);
  console.log(`OpenAI features are currently ${openaiAvailable ? 'ENABLED' : 'DISABLED'}`);
  console.log(`MCP features are currently ${config.mcp.enabled ? 'ENABLED' : 'DISABLED'}`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // For now, don't terminate the process - just log the error
});

// module.exports = app; // ESM 환경에서는 필요 없음, 삭제 또는 주석 처리
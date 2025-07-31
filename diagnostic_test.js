import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import enhancedDataModule from './server/utils/enhanced_data_module.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 환경 변수 로드
dotenv.config({ path: path.resolve(__dirname, '.env') });

// 진단 결과 저장용
const diagnosticResults = {
  timestamp: new Date().toISOString(),
  environment: {},
  parsing: {},
  chunking: {},
  embedding: {},
  vectorStore: {},
  metadata: {},
  search: {},
  performance: {},
  issues: []
};

// 로그 함수
function log(message, level = 'INFO') {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${level}] ${message}`);
}

// 진단 결과 저장
function saveDiagnosticResults() {
  const diagnosticFile = path.join(__dirname, 'diagnostic_results.json');
  fs.writeFileSync(diagnosticFile, JSON.stringify(diagnosticResults, null, 2));
  log(`진단 결과 저장됨: ${diagnosticFile}`);
}

async function runDiagnosticTests() {
  log('=== 챗봇 파이프라인 종합 진단 시작 ===', 'START');

  try {
    // 1. 환경 진단
    await diagnoseEnvironment();
    
    // 2. 파싱 진단
    await diagnoseParsing();
    
    // 3. 청킹 진단
    await diagnoseChunking();
    
    // 4. 임베딩 진단
    await diagnoseEmbedding();
    
    // 5. 벡터 스토어 진단
    await diagnoseVectorStore();
    
    // 6. 메타데이터 진단
    await diagnoseMetadata();
    
    // 7. 검색 진단
    await diagnoseSearch();
    
    // 8. 성능 진단
    await diagnosePerformance();
    
    // 9. 종합 분석
    analyzeResults();
    
  } catch (error) {
    log(`진단 중 오류 발생: ${error.message}`, 'ERROR');
    diagnosticResults.issues.push({
      type: 'CRITICAL_ERROR',
      message: error.message,
      stack: error.stack
    });
  }

  saveDiagnosticResults();
  log('=== 진단 완료 ===', 'END');
}

// 1. 환경 진단
async function diagnoseEnvironment() {
  log('1. 환경 진단 시작...', 'ENV');
  
  diagnosticResults.environment = {
    nodeVersion: process.version,
    platform: process.platform,
    openaiApiKey: !!process.env.OPENAI_API_KEY,
    vectorDir: enhancedDataModule.VECTOR_DIR,
    rawDir: enhancedDataModule.RAW_DIR,
    textDir: enhancedDataModule.TEXT_DIR
  };

  // 디렉토리 존재 확인
  const dirs = ['VECTOR_DIR', 'RAW_DIR', 'TEXT_DIR'];
  for (const dir of dirs) {
    const dirPath = enhancedDataModule[dir];
    if (dirPath && fs.existsSync(dirPath)) {
      const stats = fs.statSync(dirPath);
      diagnosticResults.environment[`${dir}_exists`] = true;
      diagnosticResults.environment[`${dir}_size`] = stats.size;
    } else {
      diagnosticResults.environment[`${dir}_exists`] = false;
      diagnosticResults.issues.push({
        type: 'MISSING_DIRECTORY',
        directory: dir,
        path: dirPath
      });
    }
  }

  log(`환경 진단 완료: OpenAI API 키 ${diagnosticResults.environment.openaiApiKey ? '있음' : '없음'}`);
}

// 2. 파싱 진단
async function diagnoseParsing() {
  log('2. 파싱 진단 시작...', 'PARSING');
  
  const testFiles = [
    { type: 'pdf', path: './test_files/sample.pdf' },
    { type: 'excel', path: './test_files/sample.xlsx' },
    { type: 'text', path: './test_files/sample.txt' }
  ];

  for (const testFile of testFiles) {
    try {
      if (fs.existsSync(testFile.path)) {
        const startTime = Date.now();
        const extractedText = await enhancedDataModule.extractTextFromFile(testFile.path);
        const endTime = Date.now();
        
        diagnosticResults.parsing[testFile.type] = {
          success: true,
          textLength: extractedText.length,
          processingTime: endTime - startTime,
          hasContent: extractedText.trim().length > 0
        };

        if (extractedText.trim().length === 0) {
          diagnosticResults.issues.push({
            type: 'PARSING_EMPTY_CONTENT',
            fileType: testFile.type,
            filePath: testFile.path
          });
        }
      } else {
        diagnosticResults.parsing[testFile.type] = {
          success: false,
          error: 'File not found'
        };
      }
    } catch (error) {
      diagnosticResults.parsing[testFile.type] = {
        success: false,
        error: error.message
      };
      diagnosticResults.issues.push({
        type: 'PARSING_ERROR',
        fileType: testFile.type,
        error: error.message
      });
    }
  }

  log('파싱 진단 완료');
}

// 3. 청킹 진단
async function diagnoseChunking() {
  log('3. 청킹 진단 시작...', 'CHUNKING');
  
  const testTexts = [
    '짧은 텍스트',
    '중간 길이의 텍스트입니다. 이것은 테스트용 텍스트입니다.',
    '긴 텍스트'.repeat(100) // 1000자 이상
  ];

  for (let i = 0; i < testTexts.length; i++) {
    try {
      const startTime = Date.now();
      const chunks = await enhancedDataModule.splitText(testTexts[i], {
        boardId: 'test',
        postNo: 'test',
        filename: `test_${i}.txt`
      });
      const endTime = Date.now();

      diagnosticResults.chunking[`test_${i}`] = {
        inputLength: testTexts[i].length,
        chunkCount: chunks.length,
        processingTime: endTime - startTime,
        averageChunkSize: chunks.length > 0 ? 
          chunks.reduce((sum, chunk) => sum + chunk.pageContent.length, 0) / chunks.length : 0
      };

      // 청크 크기 검증
      const oversizedChunks = chunks.filter(chunk => chunk.pageContent.length > 1500);
      if (oversizedChunks.length > 0) {
        diagnosticResults.issues.push({
          type: 'CHUNK_SIZE_TOO_LARGE',
          testIndex: i,
          oversizedCount: oversizedChunks.length
        });
      }

    } catch (error) {
      diagnosticResults.chunking[`test_${i}`] = {
        error: error.message
      };
      diagnosticResults.issues.push({
        type: 'CHUNKING_ERROR',
        testIndex: i,
        error: error.message
      });
    }
  }

  log('청킹 진단 완료');
}

// 4. 임베딩 진단
async function diagnoseEmbedding() {
  log('4. 임베딩 진단 시작...', 'EMBEDDING');
  
  if (!enhancedDataModule.embeddings) {
    diagnosticResults.embedding = {
      available: false,
      error: 'OpenAI API 키 없음'
    };
    diagnosticResults.issues.push({
      type: 'EMBEDDING_UNAVAILABLE',
      reason: 'OpenAI API 키 없음'
    });
    return;
  }

  try {
    const testText = '테스트 임베딩';
    const startTime = Date.now();
    const embedding = await enhancedDataModule.embeddings.embedQuery(testText);
    const endTime = Date.now();

    diagnosticResults.embedding = {
      available: true,
      embeddingLength: embedding.length,
      processingTime: endTime - startTime,
      model: 'text-embedding-ada-002'
    };

  } catch (error) {
    diagnosticResults.embedding = {
      available: false,
      error: error.message
    };
    diagnosticResults.issues.push({
      type: 'EMBEDDING_ERROR',
      error: error.message
    });
  }

  log('임베딩 진단 완료');
}

// 5. 벡터 스토어 진단
async function diagnoseVectorStore() {
  log('5. 벡터 스토어 진단 시작...', 'VECTOR_STORE');
  
  try {
    const storePath = path.join(enhancedDataModule.VECTOR_DIR, 'hira');
    const exists = fs.existsSync(storePath);
    
    diagnosticResults.vectorStore = {
      exists,
      path: storePath
    };

    if (exists) {
      const stats = fs.statSync(storePath);
      diagnosticResults.vectorStore.size = stats.size;
      diagnosticResults.vectorStore.lastModified = stats.mtime;
    } else {
      diagnosticResults.issues.push({
        type: 'VECTOR_STORE_MISSING',
        path: storePath
      });
    }

    // 벡터 스토어 초기화 테스트
    if (enhancedDataModule.embeddings) {
      try {
        await enhancedDataModule.initializeVectorStore();
        diagnosticResults.vectorStore.initialized = true;
        
        if (enhancedDataModule.vectorStore) {
          const testResults = await enhancedDataModule.vectorStore.similaritySearchWithScore('test', 1);
          diagnosticResults.vectorStore.searchable = testResults.length > 0;
        }
      } catch (error) {
        diagnosticResults.vectorStore.initialized = false;
        diagnosticResults.vectorStore.error = error.message;
        diagnosticResults.issues.push({
          type: 'VECTOR_STORE_INIT_ERROR',
          error: error.message
        });
      }
    }

  } catch (error) {
    diagnosticResults.vectorStore = {
      error: error.message
    };
    diagnosticResults.issues.push({
      type: 'VECTOR_STORE_ERROR',
      error: error.message
    });
  }

  log('벡터 스토어 진단 완료');
}

// 6. 메타데이터 진단
async function diagnoseMetadata() {
  log('6. 메타데이터 진단 시작...', 'METADATA');
  
  try {
    const metadata = enhancedDataModule.getMetadata();
    
    diagnosticResults.metadata = {
      lastSync: metadata.lastSync,
      boardCount: Object.keys(metadata.boards).length,
      fileCount: Object.keys(metadata.files).length,
      boards: Object.keys(metadata.boards)
    };

    // 메타데이터 파일 크기 확인
    const metadataFile = path.join(enhancedDataModule.VECTOR_DIR, 'metadata.json');
    if (fs.existsSync(metadataFile)) {
      const stats = fs.statSync(metadataFile);
      diagnosticResults.metadata.fileSize = stats.size;
      diagnosticResults.metadata.lastModified = stats.mtime;
    }

    // 메타데이터 무결성 검사
    const invalidFiles = Object.entries(metadata.files).filter(([key, fileInfo]) => {
      return !fileInfo.boardId || !fileInfo.postNo || !fileInfo.filename;
    });

    if (invalidFiles.length > 0) {
      diagnosticResults.issues.push({
        type: 'METADATA_INTEGRITY_ISSUE',
        invalidFileCount: invalidFiles.length
      });
    }

  } catch (error) {
    diagnosticResults.metadata = {
      error: error.message
    };
    diagnosticResults.issues.push({
      type: 'METADATA_ERROR',
      error: error.message
    });
  }

  log('메타데이터 진단 완료');
}

// 7. 검색 진단
async function diagnoseSearch() {
  log('7. 검색 진단 시작...', 'SEARCH');
  
  const testQueries = [
    '펨브롤리주맙',
    '키트루다',
    '면역항암제',
    '급여기준'
  ];

  for (const query of testQueries) {
    try {
      const startTime = Date.now();
      const results = await enhancedDataModule.searchWithSources(query, 3);
      const endTime = Date.now();

      diagnosticResults.search[query] = {
        success: true,
        resultCount: results.results.length,
        sourceCount: results.sources.length,
        processingTime: endTime - startTime,
        hasResults: results.results.length > 0
      };

      if (results.results.length === 0) {
        diagnosticResults.issues.push({
          type: 'SEARCH_NO_RESULTS',
          query: query
        });
      }

    } catch (error) {
      diagnosticResults.search[query] = {
        success: false,
        error: error.message
      };
      diagnosticResults.issues.push({
        type: 'SEARCH_ERROR',
        query: query,
        error: error.message
      });
    }
  }

  log('검색 진단 완료');
}

// 8. 성능 진단
async function diagnosePerformance() {
  log('8. 성능 진단 시작...', 'PERFORMANCE');
  
  const performanceTests = [
    { name: 'small_text_parsing', text: '작은 텍스트'.repeat(10) },
    { name: 'medium_text_parsing', text: '중간 텍스트'.repeat(100) },
    { name: 'large_text_parsing', text: '큰 텍스트'.repeat(1000) }
  ];

  for (const test of performanceTests) {
    try {
      const startTime = Date.now();
      const chunks = await enhancedDataModule.splitText(test.text, {
        boardId: 'performance_test',
        postNo: 'test',
        filename: `${test.name}.txt`
      });
      const endTime = Date.now();

      diagnosticResults.performance[test.name] = {
        inputSize: test.text.length,
        chunkCount: chunks.length,
        processingTime: endTime - startTime,
        throughput: test.text.length / ((endTime - startTime) / 1000) // chars per second
      };

    } catch (error) {
      diagnosticResults.performance[test.name] = {
        error: error.message
      };
    }
  }

  log('성능 진단 완료');
}

// 9. 종합 분석
function analyzeResults() {
  log('9. 종합 분석 시작...', 'ANALYSIS');
  
  const analysis = {
    criticalIssues: 0,
    warnings: 0,
    recommendations: []
  };

  // 문제점 분석
  diagnosticResults.issues.forEach(issue => {
    switch (issue.type) {
      case 'CRITICAL_ERROR':
      case 'EMBEDDING_UNAVAILABLE':
      case 'VECTOR_STORE_INIT_ERROR':
        analysis.criticalIssues++;
        break;
      default:
        analysis.warnings++;
    }
  });

  // 권장사항 생성
  if (!diagnosticResults.environment.openaiApiKey) {
    analysis.recommendations.push('OpenAI API 키를 설정하세요.');
  }

  if (diagnosticResults.parsing.pdf && !diagnosticResults.parsing.pdf.success) {
    analysis.recommendations.push('PDF 파싱에 문제가 있습니다. 한글 PDF 처리를 위한 외부 솔루션을 고려하세요.');
  }

  if (diagnosticResults.vectorStore && !diagnosticResults.vectorStore.exists) {
    analysis.recommendations.push('벡터 스토어가 없습니다. 데이터 동기화를 실행하세요.');
  }

  if (diagnosticResults.search && Object.values(diagnosticResults.search).some(s => !s.hasResults)) {
    analysis.recommendations.push('검색 결과가 없습니다. 더 많은 데이터를 수집하거나 임베딩을 재생성하세요.');
  }

  diagnosticResults.analysis = analysis;
  
  log(`분석 완료: ${analysis.criticalIssues}개 심각한 문제, ${analysis.warnings}개 경고`);
}

// 진단 실행
runDiagnosticTests().catch(console.error); 
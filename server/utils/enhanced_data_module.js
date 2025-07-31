import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
// GPU 기반 임베딩 매니저 사용 (Python 스크립트를 통해)
// ChromaDB는 Python 스크립트를 통해 직접 사용
// ChromaClient 제거 - LangChain Chroma만 사용
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { Document } from 'langchain/document';
import EnhancedHiraCrawler from './enhanced_crawler.js';
import MedicalChunker from './medical_chunker.js';
import HybridSearch from './hybrid_search.js';
import EnhancedDocumentProcessor from './enhanced_document_processor.js';
import XLSX from 'xlsx';
// pdf-parse는 동적 import로 처리
import dotenv from 'dotenv';

// ES 모듈에서 __dirname 사용을 위한 설정
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// 디렉토리 설정
const VECTOR_DIR = path.join(__dirname, '../data/vector');
const RAW_DIR = path.join(__dirname, '../data/raw');
const TEXT_DIR = path.join(__dirname, '../data/text');
const METADATA_FILE = path.join(VECTOR_DIR, 'metadata.json');

// Chroma 클라이언트 설정
const CHROMA_PATH = path.join(__dirname, '../../chroma_db');

// 디렉토리 생성
[VECTOR_DIR, RAW_DIR, TEXT_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

class EnhancedDataModule {
  constructor() {
    this.crawler = new EnhancedHiraCrawler(); // 게시판 크롤러 인스턴스
    this.medicalChunker = new MedicalChunker(); // 의료 문서 청크 분할기
    this.documentProcessor = new EnhancedDocumentProcessor(); // 개선된 문서 처리기
    
    // GPU 기반 임베딩 매니저 설정 (Python 스크립트를 통해 사용)
    this.embeddingModel = process.env.EMBEDDING_MODEL || "minilm"; // minilm, pubmed, mpnet 등
    this.device = process.env.DEVICE || "auto"; // cuda, cpu, auto
    console.log(`GPU 기반 임베딩 모델 설정: ${this.embeddingModel} on ${this.device}`);
    
    this.vectorStore = null;
    this.hybridSearch = null;
    this.metadata = this.loadMetadata();
    
    // Chroma 클라이언트 제거 - LangChain Chroma만 사용
  }

  // 메타데이터 로드
  loadMetadata() {
    if (fs.existsSync(METADATA_FILE)) {
      try {
        return JSON.parse(fs.readFileSync(METADATA_FILE, 'utf-8'));
      } catch (error) {
        console.error('메타데이터 로드 실패:', error);
      }
    }
    return {
      lastSync: null,
      files: {},
      boards: {
        'HIRAA030023010000': { name: '공고 게시판', lastSync: null },
        'HIRAA030023030000': { name: '항암화학요법 게시판', lastSync: null }
      }
    };
  }

  // 메타데이터 저장
  saveMetadata() {
    fs.writeFileSync(METADATA_FILE, JSON.stringify(this.metadata, null, 2));
  }

  // 파일 중복 체크
  isFileAlreadyProcessed(boardId, postNo, filename) {
    const key = `${boardId}_${postNo}_${filename}`;
    return this.metadata.files[key] !== undefined;
  }

  // 파일 메타데이터 추가
  addFileMetadata(boardId, postNo, filename, filePath, textContent = '') {
    const key = `${boardId}_${postNo}_${filename}`;
    this.metadata.files[key] = {
      boardId,
      postNo,
      filename,
      filePath,
      textContent,
      processedAt: new Date().toISOString(),
      fileSize: fs.existsSync(filePath) ? fs.statSync(filePath).size : 0
    };
    this.saveMetadata();
  }

  // 게시판별 텍스트 파일 생성
  async createTextFile(boardId, post, bodyText = '') {
    const postNo = post.postNo || 'unknown';
    const title = post.title || '제목없음';
    
    // 파일명 생성
    const fileName = `${boardId}_${postNo}_${title.replace(/[^a-zA-Z0-9가-힣]/g, '_')}_${new Date().toISOString().split('T')[0]}.txt`;
    const filePath = path.join(TEXT_DIR, fileName);
    
    // 텍스트 내용 구성
    const content = `제목: ${title}\n게시번호: ${postNo}\n게시일: ${new Date().toISOString()}\n게시판: ${this.metadata.boards[boardId]?.name || boardId}\n본문: ${bodyText}`;
    
    // 파일 저장
    fs.writeFileSync(filePath, content, 'utf-8');
    
    return {
      fileName,
      filePath,
      content
    };
  }

  // 직접적인 PDF 텍스트 추출 (EnhancedDocumentProcessor로 대체됨)
  async extractPdfText(filePath) {
    console.log('extractPdfText는 더 이상 사용되지 않습니다. EnhancedDocumentProcessor를 사용하세요.');
    return await this.extractTextFromFile(filePath);
  }

  // Excel 파일 텍스트 추출 (EnhancedDocumentProcessor로 대체됨)
  async extractExcelText(filePath) {
    console.log('extractExcelText는 더 이상 사용되지 않습니다. EnhancedDocumentProcessor를 사용하세요.');
    return await this.extractTextFromFile(filePath);
  }

  // 텍스트 파일 읽기 (EnhancedDocumentProcessor로 대체됨)
  async extractTextFile(filePath) { 
    console.log('extractTextFile는 더 이상 사용되지 않습니다. EnhancedDocumentProcessor를 사용하세요.');
    return await this.extractTextFromFile(filePath);
  }

  // 파일에서 텍스트 추출 (개선된 버전)
  async extractTextFromFile(filePath) {
    try {
      console.log(`개선된 문서 처리기로 파일 처리: ${path.basename(filePath)}`);
      
      const result = await this.documentProcessor.processFile(filePath);
      
      if (result.success) {
        console.log(`문서 처리 성공: ${result.metadata.method} (${result.metadata.pages}페이지)`);
        return result.content;
      } else {
        console.warn(`문서 처리 실패: ${result.error}`);
        return '';
      }
    } catch (error) {
      console.error(`문서 처리 중 오류: ${error.message}`);
      return '';
    }
  }

  // 텍스트를 청크로 분할
  async splitText(text, sourceInfo) {
    if (!text || text.trim() === '') {
      console.warn('빈 텍스트입니다.');
      return [];
    }

    try {
      console.log(`텍스트 청킹 시작: ${text.length}글자`);
      
      const textSplitter = new RecursiveCharacterTextSplitter({
        chunkSize: 1000,
        chunkOverlap: 200,
      });
      
      const chunks = await textSplitter.splitText(text);
      
      // Document 객체로 변환
      const documents = chunks.map((chunk, index) => {
        return new Document({
          pageContent: chunk,
          metadata: {
            ...sourceInfo,
            chunkIndex: index,
            totalChunks: chunks.length,
            textLength: text.length
          }
        });
      });
      
      console.log(`텍스트 청킹 완료: ${documents.length}개 청크`);
      return documents;
      
    } catch (error) {
      console.error('텍스트 청킹 실패:', error);
      return [];
    }
  }

  // ChromaDB Python 스크립트 실행
  async runChromaScript(command, data) {
    try {
      const scriptPath = path.join(__dirname, 'chroma_manager.py');
      const { spawn } = await import('child_process');
      
      return new Promise((resolve, reject) => {
        const pythonProcess = spawn('python', [
          scriptPath,
          command,
          JSON.stringify(data)
        ]);
        
        let output = '';
        let errorOutput = '';
        
        pythonProcess.stdout.on('data', (data) => {
          output += data.toString();
        });
        
        pythonProcess.stderr.on('data', (data) => {
          errorOutput += data.toString();
        });
        
        pythonProcess.on('close', (code) => {
          if (code === 0) {
            try {
              const result = JSON.parse(output);
              resolve(result);
            } catch (parseError) {
              reject(new Error(`JSON 파싱 실패: ${output}`));
            }
          } else {
            reject(new Error(`Python 스크립트 실행 실패 (${code}): ${errorOutput}`));
          }
        });
      });
    } catch (error) {
      throw new Error(`ChromaDB 스크립트 실행 오류: ${error.message}`);
    }
  }

  // ChromaDB 서버 연결 확인
  async checkChromaServer() {
    try {
      console.log('ChromaDB 서버 연결 확인 중...');
      
      const chromaPath = path.join(VECTOR_DIR, 'chroma_db');
      const result = await this.runChromaScript('info', {
        db_path: chromaPath,
        model_name: this.embeddingModel,
        device: this.device
      });
      
      if (result.success) {
        console.log('ChromaDB 서버 연결 성공:', result);
        return true;
      } else {
        console.error('ChromaDB 서버 연결 실패:', result.error);
        return false;
      }
    } catch (error) {
      console.error('ChromaDB 서버 연결 확인 실패:', error);
      return false;
    }
  }

  // 벡터 스토어 초기화
  async initializeVectorStore() {
    try {
      console.log('ChromaDB Python 클라이언트 초기화 중...');
      
      // ChromaDB 정보 확인
      const chromaPath = path.join(VECTOR_DIR, 'chroma_db');
      const result = await this.runChromaScript('info', {
        db_path: chromaPath,
        model_name: this.embeddingModel,
        device: this.device
      });
      
      if (result.success) {
        console.log(`ChromaDB 초기화 완료: ${result.document_count}개 문서`);
        console.log(`사용 모델: ${result.model_name}, 임베딩 차원: ${result.embedding_dimension}`);
        this.chromaPath = chromaPath;
      } else {
        throw new Error(`ChromaDB 초기화 실패: ${result.error}`);
      }
      
    } catch (error) {
      console.error('ChromaDB 초기화 실패:', error);
      throw error;
    }
  }

  // 벡터 스토어에 문서 추가
  async addToVectorStore(documents) {
    
    if (!this.chromaPath) {
      await this.initializeVectorStore();
    }

    if (documents.length === 0) {
      console.warn('추가할 문서가 없습니다.');
      return;
    }

    // 디버깅: 문서 내용 미리보기
    console.log("=== 문서 디버깅 정보 ===");
    console.log(`총 문서 수: ${documents.length}`);
    console.log("문서 미리보기:", documents.map((d, i) => ({
      index: i,
      contentPreview: d.pageContent ? d.pageContent.slice(0, 100) + '...' : '빈 내용',
      metadata: d.metadata
    })));
    console.log("=== 문서 디버깅 정보 끝 ===");

    try {
      console.log(`ChromaDB에 ${documents.length}개 문서 추가 중...`);
      
      // ChromaDB에 문서 추가
      const result = await this.runChromaScript('add_documents', {
        db_path: this.chromaPath,
        model_name: this.embeddingModel,
        device: this.device,
        documents: documents
      });
      
      if (result.success) {
        console.log(result.message);
      } else {
        throw new Error(`ChromaDB 문서 추가 실패: ${result.error}`);
      }
      
    } catch (error) {
      console.error('ChromaDB에 문서 추가 실패:', error);
      throw error;
    }
  }

  // 게시판 동기화
  async syncBoard(boardId, limit = 5) {
    console.log(`\n=== ${this.metadata.boards[boardId]?.name || boardId} 동기화 시작 ===`);
    
    try {
      // 크롤링 실행
      const results = await this.crawler.crawlBoard(boardId, limit);
      
      let newDocuments = [];
      
      for (const result of results) {
        const { downloadedFiles, bodyText, textFile, postNo, title } = result;
        
        // postNoValue를 먼저 정의 (스코프 문제 해결)
        const postNoValue = postNo || 'unknown';
        
        // 텍스트 파일 생성 (공고 게시판만)
        let textContent = '';
        let textFileInfo = null;
        if (boardId === 'HIRAA030023010000' && bodyText) {
          textFileInfo = await this.createTextFile(boardId, { postNo, title }, bodyText);
          textContent = textFileInfo.content;
          
          // 텍스트 파일 메타데이터 추가
          this.addFileMetadata(boardId, postNoValue, textFileInfo.fileName, textFileInfo.filePath, textContent);
        }
        
        // 공고 게시판의 경우 텍스트 내용을 벡터 DB에 추가
        if (boardId === 'HIRAA030023010000' && textContent && textFileInfo) {
          const sourceInfo = {
            boardId,
            postNo: postNoValue,
            title: title || '제목없음',
            filename: textFileInfo.fileName,
            filePath: textFileInfo.filePath,
            type: 'text'
          };
          
          const chunks = await this.splitText(textContent, sourceInfo);
          newDocuments.push(...chunks);
        }
        
        // 다운로드된 파일들 처리
        for (const downloadedFile of downloadedFiles) {
          const { filename, filePath } = downloadedFile;
          
          // 이미 처리된 파일인지 확인 (텍스트 내용이 있는 경우만 스킵)
          if (this.isFileAlreadyProcessed(boardId, postNoValue, filename)) {
            const existingFile = this.metadata.files[`${boardId}_${postNoValue}_${filename}`];
            console.log(`=== 메타데이터 확인: ${filename} ===`);
            console.log(`기존 파일 정보:`, existingFile);
            console.log(`기존 텍스트 길이: ${existingFile?.textContent ? existingFile.textContent.length : 0}`);
            console.log(`=== 메타데이터 확인 끝 ===`);
            
            if (existingFile && existingFile.textContent && existingFile.textContent.trim() !== '') {
              console.log(`이미 처리된 파일 (텍스트 있음): ${filename}`);
              continue;
            } else {
              console.log(`텍스트 내용이 없어서 다시 처리: ${filename}`);
            }
          }
          
          try {
            console.log(`파일 처리 시작: ${filename}`);
            
            // 파일에서 텍스트 추출
            const extractedText = await this.extractTextFromFile(filePath);
            
            // 디버깅: 추출된 텍스트 확인
            console.log(`=== 파일 텍스트 추출 디버깅: ${filename} ===`);
            console.log(`추출된 텍스트 길이: ${extractedText ? extractedText.length : 0}`);
            console.log(`텍스트 미리보기: ${extractedText ? extractedText.slice(0, 200) + '...' : '빈 텍스트'}`);
            console.log(`=== 파일 텍스트 추출 디버깅 끝 ===`);
            
            if (extractedText && extractedText.trim() !== '') {
              const sourceInfo = {
                boardId,
                postNo: postNoValue,
                title: title || '제목없음',
                filename,
                filePath,
                type: 'document'
              };
              
              const chunks = await this.splitText(extractedText, sourceInfo);
              
              // 디버깅: 청킹 결과 확인
              console.log(`=== 청킹 결과 디버깅: ${filename} ===`);
              console.log(`생성된 청크 수: ${chunks.length}`);
              if (chunks.length > 0) {
                console.log(`첫 번째 청크 미리보기: ${chunks[0].pageContent ? chunks[0].pageContent.slice(0, 100) + '...' : '빈 청크'}`);
              }
              console.log(`=== 청킹 결과 디버깅 끝 ===`);
              
              if (chunks.length > 0) {
                console.log(`파일 처리 완료: ${filename} (${chunks.length}개 청크)`);
                newDocuments.push(...chunks);
                
                // 메타데이터에 처리 정보 추가
                this.addFileMetadata(boardId, postNoValue, filename, filePath, extractedText);
              } else {
                console.log(`파일 처리 결과 없음: ${filename}`);
              }
            } else {
              console.log(`파일에서 텍스트 추출 실패: ${filename}`);
            }
            
          } catch (error) {
            console.error(`파일 처리 실패 (${filename}):`, error);
          }
        }
      }
      
      // 벡터 스토어에 추가
      console.log(`벡터 스토어에 추가할 문서: ${newDocuments.length}개`);
      if (newDocuments.length > 0) {
        await this.addToVectorStore(newDocuments);
        console.log('벡터 스토어 업데이트 완료');
      } else {
        console.log('벡터 스토어에 추가할 문서가 없습니다.');
      }
      
      // 메타데이터 업데이트
      this.metadata.boards[boardId].lastSync = new Date().toISOString();
      this.saveMetadata();
      
      console.log(`=== ${this.metadata.boards[boardId]?.name || boardId} 동기화 완료 ===`);
      return {
        success: true,
        processedPosts: results.length,
        newDocuments: newDocuments.length,
        downloadedFiles: results.reduce((sum, r) => sum + r.downloadedFiles.length, 0)
      };
      
    } catch (error) {
      console.error(`게시판 동기화 실패 (${boardId}):`, error);
      return { success: false, error: error.message };
    }
  }

  // 전체 동기화
  async sync() {
    console.log('=== 전체 동기화 시작 ===');
    
    const results = {};
    
    for (const boardId of Object.keys(this.metadata.boards)) {
      results[boardId] = await this.syncBoard(boardId, 1); // 가장 최근 1개만
    }
    
    this.metadata.lastSync = new Date().toISOString();
    this.saveMetadata();
    
    console.log('=== 전체 동기화 완료 ===');
    return results;
  }

  // 검색 (소스 포함) - 하이브리드 검색 사용
  async searchWithSources(query, limit = 5) {
    if (!this.chromaPath) {
      await this.initializeVectorStore();
    }

    // ChromaDB 벡터 검색 사용
    const vectorResults = await this.runChromaScript('search', {
      db_path: this.chromaPath,
      model_name: this.embeddingModel,
      device: this.device,
      query: query,
      n_results: limit
    });
  
  let results = [];
  if (vectorResults.success) {
    results = vectorResults.results.map(result => ({
      content: result.pageContent,
      score: result.score,
      sourceInfo: result.metadata,
      searchType: 'vector'
    }));
  } else {
    console.log('벡터 검색 실패, 키워드 검색만 사용:', vectorResults.error);
    // 키워드 검색으로 대체
    results = this.searchByKeywords(query, limit).map(result => ({
      ...result,
      searchType: 'keyword'
    }));
  }
    
    const processedResults = results.map(result => ({
      content: result.content,
      score: result.finalScore || result.score,
      sourceInfo: result.sourceInfo,
      searchType: result.searchType
    }));

    // 소스 정보 수집
    const sources = new Map();
    processedResults.forEach(result => {
      const key = `${result.sourceInfo.boardId}_${result.sourceInfo.postNo}`;
      if (!sources.has(key)) {
        sources.set(key, {
          boardId: result.sourceInfo.boardId,
          postNo: result.sourceInfo.postNo,
          title: result.sourceInfo.title,
          filename: result.sourceInfo.filename,
          filePath: result.sourceInfo.filePath,
          type: result.sourceInfo.type
        });
      }
    });

    return {
      results: processedResults,
      sources: Array.from(sources.values())
    };
  }

  // 단순 검색
  async search(query, limit = 5) {
    if (!this.chromaPath) {
      await this.initializeVectorStore();
    }

    const result = await this.runChromaScript('search', {
      db_path: this.chromaPath,
      model_name: this.embeddingModel,
      device: this.device,
      query: query,
      n_results: limit
    });
    
    if (result.success) {
      return result.results.map(doc => ({
        content: doc.pageContent,
        score: doc.score,
        sourceInfo: doc.metadata
      }));
    } else {
      console.log('벡터 검색 실패:', result.error);
      return [];
    }
  }

  // 메타데이터 조회
  getMetadata() {
    return this.metadata;
  }

  // 특정 게시글의 파일 목록 조회
  getPostFiles(boardId, postNo) {
    const files = [];
    for (const [key, fileInfo] of Object.entries(this.metadata.files)) {
      if (fileInfo.boardId === boardId && fileInfo.postNo == postNo) {
        files.push(fileInfo);
      }
    }
    return files;
  }

  // 키워드 기반 검색
  searchByKeywords(query, limit = 5) {
    const results = [];
    const queryLower = query.toLowerCase();
    
    // 메타데이터의 모든 파일에서 검색
    for (const [key, fileInfo] of Object.entries(this.metadata.files)) {
      if (fileInfo.textContent && fileInfo.textContent.toLowerCase().includes(queryLower)) {
        // 텍스트에서 관련 부분 추출
        const text = fileInfo.textContent;
        const index = text.toLowerCase().indexOf(queryLower);
        const start = Math.max(0, index - 100);
        const end = Math.min(text.length, index + query.length + 100);
        const excerpt = text.substring(start, end);
        
        results.push({
          content: excerpt,
          score: 0.8, // 키워드 매칭 점수
          sourceInfo: {
            boardId: fileInfo.boardId,
            postNo: fileInfo.postNo,
            title: fileInfo.filename,
            filename: fileInfo.filename,
            filePath: fileInfo.filePath,
            type: 'text'
          }
        });
        
        if (results.length >= limit) break;
      }
    }
    
    return results.sort((a, b) => b.score - a.score);
  }

  // query 함수 추가 - hira_data_module.js와 호환성 유지
  async query(q) {
    const { results, sources } = await this.searchWithSources(q, 5);
    
    console.log(`\n🔍 검색 결과: "${q}"`);
    console.log(`📊 총 ${results.length}개 결과, ${sources.length}개 소스`);
    
    results.forEach((r, i) => {
      const source = r.sourceInfo;
      console.log(`\n[${i + 1}] 점수: ${r.score.toFixed(2)}`);
      console.log(`📄 소스: ${source.title} (게시글 #${source.postNo})`);
      console.log(`📁 파일: ${source.filename || '본문'}`);
      console.log(`💬 내용: ${r.content.slice(0, 200)}…`);
    });
    
    console.log(`\n📚 참고 소스:`);
    sources.forEach((source, i) => {
      console.log(`  ${i + 1}. ${source.title} (게시글 #${source.postNo})`);
    });

    return results;
  }
}

// 클래스와 인스턴스 모두 export
const enhancedDataModule = new EnhancedDataModule();

export default enhancedDataModule;
export { EnhancedDataModule, VECTOR_DIR, RAW_DIR, TEXT_DIR }; 
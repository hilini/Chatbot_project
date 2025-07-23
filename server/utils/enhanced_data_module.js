import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { OpenAIEmbeddings } from '@langchain/openai';
import { FaissStore } from '@langchain/community/vectorstores/faiss';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import EnhancedHiraCrawler from './enhanced_crawler.js';
import MedicalChunker from './medical_chunker.js';
import HybridSearch from './hybrid_search.js';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// 디렉토리 설정
const VECTOR_DIR = path.join(__dirname, '../data/vector');
const RAW_DIR = path.join(__dirname, '../data/raw');
const TEXT_DIR = path.join(__dirname, '../data/text');
const METADATA_FILE = path.join(VECTOR_DIR, 'metadata.json');

// 디렉토리 생성
[VECTOR_DIR, RAW_DIR, TEXT_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

class EnhancedDataModule {
  constructor() {
    this.crawler = new EnhancedHiraCrawler();
    this.medicalChunker = new MedicalChunker();
    
    // OpenAI API 키가 있는 경우에만 embeddings 초기화
    console.log('OpenAI API 키 확인:', process.env.OPENAI_API_KEY ? '있음' : '없음');
    if (process.env.OPENAI_API_KEY) {
      console.log('OpenAI embeddings 초기화 중...');
      this.embeddings = new OpenAIEmbeddings({
        openAIApiKey: process.env.OPENAI_API_KEY,
      });
      console.log('OpenAI embeddings 초기화 완료');
    } else {
      console.warn('OpenAI API 키가 없습니다. 벡터 검색 기능이 제한됩니다.');
      this.embeddings = null;
    }
    
    this.vectorStore = null;
    this.hybridSearch = null;
    this.metadata = this.loadMetadata();
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
    const fileName = `${boardId}_${postNo}_${title.replace(/[^a-zA-Z0-9가-힣]/g, '_')}.txt`;
    const filePath = path.join(TEXT_DIR, fileName);
    
    let content = `제목: ${title}\n`;
    content += `게시번호: ${postNo}\n`;
    content += `게시일: ${new Date().toISOString()}\n`;
    content += `게시판: ${this.metadata.boards[boardId]?.name || boardId}\n`;
    content += `\n본문:\n${bodyText}\n`;
    
    fs.writeFileSync(filePath, content, 'utf-8');
    return { fileName, filePath, content };
  }

  // 텍스트 청킹 (의료 특화)
  async splitText(text, sourceInfo) {
    // 의료 문서인 경우 특화 청킹 사용
    if (sourceInfo.type === 'text' && text.length > 500) {
      return await this.medicalChunker.chunkMedicalDocument(text, sourceInfo);
    }
    
    // 일반 문서는 기존 방식 사용
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 800,
      chunkOverlap: 200,
    });

    const chunks = await splitter.splitText(text);
    
    return chunks.map((chunk, index) => ({
      pageContent: chunk,
      metadata: {
        ...sourceInfo,
        chunkIndex: index,
        totalChunks: chunks.length,
        chunkType: 'general'
      }
    }));
  }

  // 벡터 스토어 초기화
  async initializeVectorStore() {
    if (!this.embeddings) {
      console.warn('OpenAI API 키가 없어 벡터 스토어를 초기화할 수 없습니다.');
      return;
    }
    
    const storePath = path.join(VECTOR_DIR, 'hira');
    
    if (fs.existsSync(storePath)) {
      try {
        this.vectorStore = await FaissStore.load(storePath, this.embeddings);
        console.log('기존 벡터 스토어 로드됨');
      } catch (error) {
        console.error('벡터 스토어 로드 실패:', error);
        this.vectorStore = null;
      }
    }
    
    if (!this.vectorStore) {
      this.vectorStore = await FaissStore.fromTexts(
        ['초기화'],
        [{ boardId: 'init', postNo: '0', filename: 'init.txt' }],
        this.embeddings
      );
      console.log('새 벡터 스토어 생성됨');
    }
    
    // 하이브리드 검색 초기화
    this.hybridSearch = new HybridSearch(this.embeddings, this.vectorStore);
  }

  // 벡터 스토어에 문서 추가
  async addToVectorStore(documents) {
    if (!this.embeddings) {
      console.warn('OpenAI API 키가 없어 벡터 스토어에 문서를 추가할 수 없습니다.');
      return;
    }
    
    if (!this.vectorStore) {
      await this.initializeVectorStore();
    }

    if (documents.length === 0) {
      console.warn('추가할 문서가 없습니다.');
      return;
    }

    try {
      console.log(`벡터 스토어에 ${documents.length}개 문서 추가 중...`);
      
      // 기존 벡터 스토어가 "초기화" 더미 데이터만 있으면 새로 생성
      if (this.vectorStore && documents.length > 0) {
        const testResults = await this.vectorStore.similaritySearchWithScore('test', 1);
        if (testResults.length > 0 && testResults[0][0].pageContent === '초기화') {
          console.log('기존 더미 데이터 제거하고 새로 생성...');
          this.vectorStore = null;
        }
      }
      
      // 벡터 스토어가 없으면 새로 생성
      if (!this.vectorStore) {
        console.log('새 벡터 스토어 생성...');
        this.vectorStore = await FaissStore.fromDocuments(documents, this.embeddings);
      } else {
        // 기존 벡터 스토어에 문서 추가
        for (const doc of documents) {
          await this.vectorStore.addDocuments([doc]);
        }
      }
      
      // 벡터 스토어 저장
      await this.vectorStore.save(path.join(VECTOR_DIR, 'hira'));
      console.log(`${documents.length}개 문서가 벡터 스토어에 추가됨`);
      
      // 하이브리드 검색 업데이트
      this.hybridSearch = new HybridSearch(this.embeddings, this.vectorStore);
      
    } catch (error) {
      console.error('벡터 스토어에 문서 추가 실패:', error);
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
        
        // 텍스트 파일 생성 (공고 게시판만)
        let textContent = '';
        let textFileInfo = null;
        if (boardId === 'HIRAA030023010000' && bodyText) {
          textFileInfo = await this.createTextFile(boardId, { postNo, title }, bodyText);
          textContent = textFileInfo.content;
          
          // 텍스트 파일 메타데이터 추가
          const postNoValue = postNo || 'unknown';
          this.addFileMetadata(boardId, postNoValue, textFileInfo.fileName, textFileInfo.filePath, textContent);
        }
        
        // 다운로드된 파일들 처리
        for (const downloadedFile of downloadedFiles) {
          const { filename, filePath } = downloadedFile;
          
          // 중복 체크
          const postNoValue = postNo || 'unknown';
          if (this.isFileAlreadyProcessed(boardId, postNoValue, filename)) {
            console.log(`이미 처리된 파일: ${filename}`);
            continue;
          }
          
          // 파일 메타데이터 추가
          this.addFileMetadata(boardId, postNoValue, filename, filePath);
          
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
    if (!this.embeddings) {
      console.warn('OpenAI API 키가 없어 벡터 검색을 수행할 수 없습니다.');
      return {
        results: [],
        sources: []
      };
    }
    
    if (!this.vectorStore) {
      await this.initializeVectorStore();
    }

    // 하이브리드 검색 사용
    const results = await this.hybridSearch.hybridSearch(query, limit);
    
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
    if (!this.vectorStore) {
      await this.initializeVectorStore();
    }

    const results = await this.vectorStore.similaritySearchWithScore(query, limit);
    
    return results.map(([doc, score]) => ({
      content: doc.pageContent,
      score: score,
      sourceInfo: doc.metadata
    }));
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
}

// 싱글톤 인스턴스
const enhancedDataModule = new EnhancedDataModule();

export default enhancedDataModule;
export { VECTOR_DIR, RAW_DIR, TEXT_DIR }; 
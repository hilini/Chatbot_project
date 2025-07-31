/**
 * PDF 처리 및 벡터화 유틸리티
 * 
 * 이 모듈은 PDF 파일을 처리하고 내용을 추출하여 로컬 벡터 데이터베이스에 저장하는 기능을 제공합니다.
 * 각 텍스트 청크에 페이지 번호 정보를 추가하여 검색 결과에서 관련 페이지로 직접 이동할 수 있게 합니다.
 */

const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const { OpenAIEmbeddings } = require('@langchain/openai');
const { RecursiveCharacterTextSplitter } = require('langchain/text_splitter');
const { FaissStore } = require('@langchain/community/vectorstores/faiss');
const { Document } = require('langchain/document');
const config = require('../../config');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// 디렉토리 확인 및 생성 함수
function ensureDirectoryExists(directoryPath) {
  if (!fs.existsSync(directoryPath)) {
    fs.mkdirSync(directoryPath, { recursive: true });
    console.log(`디렉토리 생성됨: ${directoryPath}`);
  }
}

// 벡터 저장소 디렉토리 설정
const VECTOR_STORE_DIR = path.join(__dirname, '..', 'data', 'vector_db');
ensureDirectoryExists(VECTOR_STORE_DIR);

// OpenAI 임베딩 인스턴스 초기화
const embeddings = new OpenAIEmbeddings({
  openAIApiKey: process.env.OPENAI_API_KEY,
  modelName: config.ai?.embeddingModel || 'text-embedding-ada-002'
});

// 네임스페이스 설정
const NAMESPACE = 'cancer-treatment';

/**
 * PDF 파일에서 텍스트를 추출하는 함수
 */
async function extractTextFromPDF(pdfPath) {
  try {
    console.log(`PDF 파일 읽기 시작: ${pdfPath}`);
    
    // PDF 파일이 존재하는지 확인
    if (!fs.existsSync(pdfPath)) {
      throw new Error(`PDF 파일이 존재하지 않습니다: ${pdfPath}`);
    }
    
    // PDF 파일 읽기
    const dataBuffer = fs.readFileSync(pdfPath);
    const stats = fs.statSync(pdfPath);
    const fileSize = stats.size;
    
    console.log(`PDF 파일 크기: ${fileSize} bytes`);
    
    // pdf-parse를 사용하여 텍스트 추출
    const data = await pdfParse(dataBuffer);
    console.log(`PDF 파싱 완료. 총 ${data.numpages}페이지`);
    
    // 전체 텍스트를 페이지별로 분할
    const totalText = data.text;
    const avgCharsPerPage = Math.ceil(totalText.length / data.numpages);
    
    const pageTexts = [];
    
    for (let i = 1; i <= data.numpages; i++) {
      const startIdx = (i - 1) * avgCharsPerPage;
      const endIdx = Math.min(startIdx + avgCharsPerPage, totalText.length);
      const pageText = totalText.slice(startIdx, endIdx);
      
      // 계층 구조 정보 추출 시도
      const hierarchy = extractHierarchyFromText(pageText);
      
      pageTexts.push({
        page: i,
        text: pageText,
        hierarchy: hierarchy
      });
      
      console.log(`페이지 ${i} 텍스트 추출 완료 (${endIdx - startIdx} 글자)`);
    }
    
    console.log(`PDF 텍스트 추출 완료. 총 ${pageTexts.length}개 페이지 처리됨`);
    return pageTexts;
    
  } catch (error) {
    console.error('PDF 텍스트 추출 오류:', error);
    throw new Error(`PDF 텍스트 추출 실패: ${error.message}`);
  }
}

/**
 * 텍스트에서 계층 구조 정보를 추출하는 함수
 */
function extractHierarchyFromText(text) {
  const hierarchy = {
    cancerType: null,
    treatmentMethod: null,
    administrationStage: null
  };
  
  // 암종 패턴 검색
  const cancerPatterns = [
    /([가-힣]+암)/g,
    /(폐암|유방암|대장암|위암|간암|췌장암|전립선암|난소암|자궁경부암|갑상선암)/g
  ];
  
  for (const pattern of cancerPatterns) {
    const matches = text.match(pattern);
    if (matches && matches.length > 0) {
      hierarchy.cancerType = matches[0];
      break;
    }
  }
  
  // 치료 방법 패턴 검색
  const treatmentPatterns = [
    /(화학요법|방사선치료|면역치료|표적치료|호르몬요법|수술)/g,
    /(고식적요법|보조요법|선행화학요법)/g
  ];
  
  for (const pattern of treatmentPatterns) {
    const matches = text.match(pattern);
    if (matches && matches.length > 0) {
      hierarchy.treatmentMethod = matches[0];
      break;
    }
  }
  
  // 투여 단계 패턴 검색
  const stagePatterns = [
    /(\d+차)/g,
    /(투여단계|투여라인)/g
  ];
  
  for (const pattern of stagePatterns) {
    const matches = text.match(pattern);
    if (matches && matches.length > 0) {
      hierarchy.administrationStage = matches[0];
      break;
    }
  }
  
  return hierarchy;
}

/**
 * 텍스트를 청크로 분할하는 함수
 */
async function splitTextIntoChunks(pageTexts) {
  try {
    console.log('텍스트 청킹 시작...');
    
    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });
    
    const chunksWithPageInfo = [];
    
    for (const pageData of pageTexts) {
      const chunks = await textSplitter.splitText(pageData.text);
      
      chunks.forEach((chunk, chunkIndex) => {
        chunksWithPageInfo.push({
          text: chunk,
          page: pageData.page,
          hierarchy: pageData.hierarchy,
          chunkIndex: chunkIndex
        });
      });
    }
    
    console.log(`청킹 완료: ${chunksWithPageInfo.length}개 청크 생성`);
    return chunksWithPageInfo;
    
  } catch (error) {
    console.error('텍스트 청킹 오류:', error);
    throw new Error(`텍스트 청킹 실패: ${error.message}`);
  }
}

/**
 * 청크를 Document 객체로 변환하는 함수
 */
function createDocumentsFromChunks(chunksWithPageInfo, metadata = {}) {
  try {
    console.log('Document 객체 생성 시작...');
    
    const documents = chunksWithPageInfo.map((chunkData, index) => {
      return new Document({
        pageContent: chunkData.text,
        metadata: {
          ...metadata,
          page: chunkData.page,
          chunkIndex: chunkData.chunkIndex,
          hierarchy: chunkData.hierarchy,
          documentIndex: index
        }
      });
    });
    
    console.log(`Document 객체 생성 완료: ${documents.length}개`);
    return documents;
    
  } catch (error) {
    console.error('Document 객체 생성 오류:', error);
    throw new Error(`Document 객체 생성 실패: ${error.message}`);
  }
}

/**
 * 벡터 DB에 문서를 저장하는 함수
 */
async function storeDocumentsInVectorDB(documents, namespace = NAMESPACE) {
  try {
    console.log(`벡터 DB 저장 시작: ${documents.length}개 문서`);
    
    // 저장 경로 설정
    const storeDir = path.join(VECTOR_STORE_DIR, namespace);
    ensureDirectoryExists(storeDir);
    
    // 벡터 스토어 생성 및 저장
    const vectorStore = await FaissStore.fromDocuments(documents, embeddings);
    await vectorStore.save(storeDir);
    
    console.log(`벡터 DB 저장 완료: ${storeDir}`);
    
  } catch (error) {
    console.error('벡터 DB 저장 오류:', error);
    throw new Error(`벡터 DB 저장 실패: ${error.message}`);
  }
}

/**
 * PDF 파일을 처리하고 벡터화하여 저장하는 함수
 */
async function processPDF(pdfPath, metadata = {}) {
  try {
    console.log(`PDF 파일 처리 중: ${pdfPath}`);
    
    // PDF에서 페이지별 텍스트 추출
    const pageTexts = await extractTextFromPDF(pdfPath);
    console.log(`추출된 페이지 수: ${pageTexts.length}`);
    
    // 텍스트를 청크로 분할 (페이지 정보 유지)
    const chunksWithPageInfo = await splitTextIntoChunks(pageTexts);
    console.log(`생성된 청크 수: ${chunksWithPageInfo.length}`);
    
    // 메타데이터 준비
    const fileMetadata = {
      source: path.basename(pdfPath),
      title: metadata.title || path.basename(pdfPath, '.pdf'),
      author: metadata.author || 'unknown',
      date: metadata.date || new Date().toISOString(),
      category: metadata.category || 'cancer-treatment',
      filePath: pdfPath,
      ...metadata
    };
    
    // 청크를 문서로 변환 (페이지 정보 포함)
    const documents = createDocumentsFromChunks(chunksWithPageInfo, fileMetadata);
    
    // 벡터 DB에 저장
    await storeDocumentsInVectorDB(documents, metadata.namespace || NAMESPACE);
    
    // 전체 텍스트 내용 생성
    const textContent = pageTexts.map(page => page.text).join('\n\n');
    
    return {
      success: true,
      documentCount: documents.length,
      message: `PDF 파일 '${path.basename(pdfPath)}'가 성공적으로 처리되었습니다.`,
      pageCount: pageTexts.length,
      textContent: textContent
    };
  } catch (error) {
    console.error('PDF 처리 오류:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * 벡터 DB에서 유사한 문서를 검색하는 함수
 */
async function searchSimilarDocuments(query, namespace = NAMESPACE, topK = 5) {
  try {
    console.log(`검색 쿼리: "${query}"`);
    
    // 저장 경로 설정
    const storeDir = path.join(VECTOR_STORE_DIR, namespace);
    
    // 벡터 스토어가 존재하는지 확인
    if (!fs.existsSync(path.join(storeDir, 'faiss.index'))) {
      throw new Error(`벡터 DB가 존재하지 않습니다: ${storeDir}`);
    }
    
    // 벡터 스토어 로드
    const vectorStore = await FaissStore.load(storeDir, embeddings);
    
    // 유사한 문서 검색
    const results = await vectorStore.similaritySearch(query, topK);
    
    console.log(`검색 결과: ${results.length}개 문서 발견`);
    return results;
  } catch (error) {
    console.error('문서 검색 오류:', error);
    throw new Error(`문서 검색 실패: ${error.message}`);
  }
}

/**
 * 저장된 모든 네임스페이스 목록을 가져오는 함수
 */
function getAvailableNamespaces() {
  try {
    if (!fs.existsSync(VECTOR_STORE_DIR)) {
      return [];
    }
    
    return fs.readdirSync(VECTOR_STORE_DIR)
      .filter(dir => fs.statSync(path.join(VECTOR_STORE_DIR, dir)).isDirectory())
      .filter(dir => fs.existsSync(path.join(VECTOR_STORE_DIR, dir, 'faiss.index')));
  } catch (error) {
    console.error('네임스페이스 조회 오류:', error);
    return [];
  }
}

/**
 * 네임스페이스의 총 페이지 수를 가져오는 함수
 */
function getNamespacePageCount(namespace = NAMESPACE) {
  try {
    const storeDir = path.join(VECTOR_STORE_DIR, namespace);
    if (!fs.existsSync(path.join(storeDir, 'docstore.json'))) {
      return 0;
    }
    
    // docstore.json 파일 읽기
    const docstoreData = JSON.parse(fs.readFileSync(path.join(storeDir, 'docstore.json'), 'utf8'));
    
    // 모든 문서의 메타데이터에서 페이지 번호 추출
    const pages = new Set();
    for (const key in docstoreData) {
      if (docstoreData[key]?.metadata?.page) {
        pages.add(docstoreData[key].metadata.page);
      }
    }
    
    return pages.size;
  } catch (error) {
    console.error('페이지 수 조회 오류:', error);
    return 0;
  }
}

module.exports = {
  processPDF,
  searchSimilarDocuments,
  extractTextFromPDF,
  getAvailableNamespaces,
  getNamespacePageCount,
  VECTOR_STORE_DIR,
  NAMESPACE
}; 
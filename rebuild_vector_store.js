import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { OpenAIEmbeddings } from '@langchain/openai';
import { FaissStore } from '@langchain/community/vectorstores/faiss';
import dotenv from 'dotenv';
import MedicalChunker from './server/utils/medical_chunker.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 환경 변수 로드
dotenv.config({ path: path.resolve(__dirname, '.env') });

const VECTOR_DIR = path.join(__dirname, 'server/data/vector');
const METADATA_FILE = path.join(VECTOR_DIR, 'metadata.json');

async function rebuildVectorStore() {
  console.log('=== 벡터 스토어 재생성 시작 ===');
  
  // 1. OpenAI embeddings 초기화
  if (!process.env.OPENAI_API_KEY) {
    console.error('OpenAI API 키가 없습니다.');
    return;
  }
  
  const embeddings = new OpenAIEmbeddings({
    openAIApiKey: process.env.OPENAI_API_KEY,
  });
  
  // 2. 메타데이터 로드
  if (!fs.existsSync(METADATA_FILE)) {
    console.error('메타데이터 파일이 없습니다.');
    return;
  }
  
  const metadata = JSON.parse(fs.readFileSync(METADATA_FILE, 'utf-8'));
  console.log(`메타데이터 로드됨: ${Object.keys(metadata.files).length}개 파일`);
  
  // 3. 의료 청커 초기화
  const medicalChunker = new MedicalChunker();
  
  // 4. 텍스트 파일에서 데이터 추출
  const documents = [];
  
  for (const [key, fileInfo] of Object.entries(metadata.files)) {
    if (!fileInfo.textContent || fileInfo.textContent.trim().length < 100) {
      console.log(`건너뛰기: ${fileInfo.filename} (텍스트 내용 부족)`);
      continue;
    }
    
    console.log(`처리 중: ${fileInfo.filename}`);
    
    try {
      // 의료 특화 청킹
      const sourceInfo = {
        boardId: fileInfo.boardId,
        postNo: fileInfo.postNo,
        title: fileInfo.filename.replace('.txt', ''),
        filename: fileInfo.filename,
        filePath: fileInfo.filePath,
        type: 'text'
      };
      
      const chunks = await medicalChunker.chunkMedicalDocument(fileInfo.textContent, sourceInfo);
      documents.push(...chunks);
      
      console.log(`  - ${chunks.length}개 청크 생성`);
      
    } catch (error) {
      console.error(`  - 오류: ${error.message}`);
    }
  }
  
  console.log(`총 ${documents.length}개 문서 청크 생성됨`);
  
  if (documents.length === 0) {
    console.error('처리할 문서가 없습니다.');
    return;
  }
  
  // 5. 벡터 스토어 생성
  console.log('벡터 스토어 생성 중...');
  
  try {
    const vectorStore = await FaissStore.fromDocuments(documents, embeddings);
    
    // 6. 벡터 스토어 저장
    const storePath = path.join(VECTOR_DIR, 'hira');
    await vectorStore.save(storePath);
    
    console.log(`벡터 스토어 저장 완료: ${storePath}`);
    
    // 7. 테스트 검색
    console.log('\n=== 테스트 검색 ===');
    const testQueries = [
      '펨브롤리주맙 급여기준',
      '키트루다 적응증',
      '면역항암제'
    ];
    
    for (const query of testQueries) {
      console.log(`\n검색: "${query}"`);
      const results = await vectorStore.similaritySearchWithScore(query, 3);
      
      results.forEach(([doc, score], i) => {
        console.log(`  ${i + 1}. 점수: ${score.toFixed(3)}`);
        console.log(`     섹션: ${doc.metadata.section || 'N/A'}`);
        console.log(`     내용: ${doc.pageContent.substring(0, 150)}...`);
      });
    }
    
    console.log('\n=== 벡터 스토어 재생성 완료 ===');
    
  } catch (error) {
    console.error('벡터 스토어 생성 오류:', error);
  }
}

// 실행
rebuildVectorStore().catch(console.error); 
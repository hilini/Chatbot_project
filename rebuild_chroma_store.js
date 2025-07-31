import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { OpenAIEmbeddings } from '@langchain/openai';
import { Chroma } from '@langchain/community/vectorstores/chroma';
import { Document } from 'langchain/document';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 환경 변수 로드
dotenv.config({ path: path.resolve(__dirname, '.env') });

async function rebuildChromaStore() {
  console.log('=== Chroma 벡터 스토어 재생성 시작 ===');
  
  // 1. OpenAI embeddings 초기화
  if (!process.env.OPENAI_API_KEY) {
    console.error('OpenAI API 키가 없습니다.');
    return;
  }
  
  const embeddings = new OpenAIEmbeddings({
    openAIApiKey: process.env.OPENAI_API_KEY,
  });
  
  console.log('✅ OpenAI embeddings 초기화 완료');
  
  // 2. 샘플 데이터 생성
  const sampleDocuments = [
    new Document({
      pageContent: "펨브롤리주맙(키트루다)은 면역항암제로, PD-1 억제제입니다. 주요 적응증은 비소세포폐암, 흑색종, 두경부암 등입니다.",
      metadata: {
        boardId: 'HIRAA030023030000',
        postNo: 'sample_001',
        filename: '키트루다_정보.txt',
        title: '키트루다 정보',
        type: 'text'
      }
    }),
    new Document({
      pageContent: "옵디보(니볼루맙)는 면역항암제로, PD-1 억제제입니다. 주요 적응증은 비소세포폐암, 신세포암, 흑색종 등입니다.",
      metadata: {
        boardId: 'HIRAA030023030000',
        postNo: 'sample_002',
        filename: '옵디보_정보.txt',
        title: '옵디보 정보',
        type: 'text'
      }
    }),
    new Document({
      pageContent: "테센트릭(아테졸리주맙)은 면역항암제로, PD-L1 억제제입니다. 주요 적응증은 소세포폐암, 유방암, 요로상피암 등입니다.",
      metadata: {
        boardId: 'HIRAA030023030000',
        postNo: 'sample_003',
        filename: '테센트릭_정보.txt',
        title: '테센트릭 정보',
        type: 'text'
      }
    })
  ];
  
  console.log(`✅ 샘플 데이터 ${sampleDocuments.length}개 생성됨`);
  
  // 3. Chroma 벡터 스토어 생성
  console.log('🔄 Chroma 벡터 스토어 생성 중...');
  
  try {
    const vectorStore = await Chroma.fromDocuments(sampleDocuments, embeddings, {
      collectionName: 'hira_medical_docs',
      url: "http://localhost:8765" // HTTP 서버 주소 (8765번 포트)
    });
    
    console.log('✅ Chroma 벡터 스토어 생성 완료!');
    
    // 4. 테스트 검색
    console.log('\n=== 테스트 검색 ===');
    const testQueries = [
      '펨브롤리주맙 급여기준',
      '키트루다 적응증',
      '면역항암제'
    ];
    
    for (const query of testQueries) {
      console.log(`\n🔍 검색어: "${query}"`);
      const results = await vectorStore.similaritySearch(query, 2);
      
      results.forEach((doc, index) => {
        console.log(`  ${index + 1}. ${doc.metadata.title}`);
        console.log(`     내용: ${doc.pageContent.substring(0, 100)}...`);
      });
    }
    
    console.log('\n🎉 Chroma 벡터 스토어 재생성 완료!');
    
  } catch (error) {
    console.error('❌ Chroma 벡터 스토어 생성 실패:', error);
    throw error;
  }
}

// 스크립트 실행
rebuildChromaStore().catch(console.error); 
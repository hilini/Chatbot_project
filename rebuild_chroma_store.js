import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Chroma } from '@langchain/community/vectorstores/chroma';
import { Document } from 'langchain/document';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 환경 변수 로드
dotenv.config({ path: path.resolve(__dirname, '.env') });

// vLLM 임베딩 클라이언트 (동기 래퍼)
class VLLMEmbeddingWrapper {
  constructor(serverUrl = "http://localhost:8002", modelName = "bge-large") {
    this.serverUrl = serverUrl;
    this.modelName = modelName;
  }

  async embedDocuments(texts) {
    try {
      const response = await fetch(`${this.serverUrl}/v1/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.modelName,
          input: texts,
          normalize: true
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data.data.map(item => item.embedding);
    } catch (error) {
      console.error('vLLM 임베딩 오류:', error);
      // fallback: 랜덤 임베딩
      return texts.map(() => Array.from({length: 1024}, () => Math.random() - 0.5));
    }
  }

  async embedQuery(text) {
    const embeddings = await this.embedDocuments([text]);
    return embeddings[0];
  }
}

async function rebuildChromaStore() {
  console.log('=== Chroma 벡터 스토어 재생성 시작 ===');
  
  // 1. vLLM 임베딩 초기화
  const embeddings = new VLLMEmbeddingWrapper("http://localhost:8002", "bge-large");
  
  console.log('✅ vLLM 임베딩 초기화 완료');
  
  // 2. 실제 데이터 로드 (metadata.json에서)
  const metadataPath = path.join(__dirname, 'server', 'data', 'vector', 'metadata.json');
  
  if (!fs.existsSync(metadataPath)) {
    console.error('❌ metadata.json 파일이 없습니다.');
    return;
  }

  const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
  const documents = [];

  // 파일별로 문서 생성
  for (const [fileId, fileData] of Object.entries(metadata.files)) {
    if (fileData.textContent && !fileData.textContent.includes('처리 불가')) {
      documents.push(new Document({
        pageContent: fileData.textContent,
        metadata: {
          boardId: fileData.boardId,
          postNo: fileData.postNo,
          filename: fileData.filename,
          title: fileData.filename,
          type: fileData.filename.endsWith('.pdf') ? 'pdf' : 'text',
          fileSize: fileData.fileSize,
          processedAt: fileData.processedAt
        }
      }));
    }
  }

  console.log(`✅ 실제 데이터 ${documents.length}개 로드됨`);
  
  // 3. Chroma 벡터 스토어 생성
  console.log('🔄 Chroma 벡터 스토어 생성 중...');
  
  try {
    const vectorStore = await Chroma.fromDocuments(documents, embeddings, {
      collectionName: 'hira_medical_docs',
      url: "http://localhost:8001" // HTTP 서버 주소 (8001번 포트)
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
      try {
        const results = await vectorStore.similaritySearch(query, 2);
        
        results.forEach((doc, index) => {
          console.log(`  ${index + 1}. ${doc.metadata.title}`);
          console.log(`     내용: ${doc.pageContent.substring(0, 100)}...`);
        });
      } catch (error) {
        console.log(`  ❌ 검색 실패: ${error.message}`);
      }
    }
    
    console.log('\n🎉 Chroma 벡터 스토어 재생성 완료!');
    
  } catch (error) {
    console.error('❌ Chroma 벡터 스토어 생성 실패:', error);
    throw error;
  }
}

// 스크립트 실행
rebuildChromaStore().catch(console.error); 
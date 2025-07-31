import { EnhancedDataModule } from './server/utils/enhanced_data_module.js';
import fs from 'fs';

async function performanceTest() {
  console.log('=== Chroma 성능 테스트 ===');
  
  const dataModule = new EnhancedDataModule();
  
  try {
    // 1. 초기화 시간 측정
    console.log('\n1. 벡터 스토어 초기화 시간 측정...');
    const initStart = Date.now();
    await dataModule.initializeVectorStore();
    const initTime = Date.now() - initStart;
    console.log(`초기화 시간: ${initTime}ms`);
    
    // 2. 검색 성능 측정
    console.log('\n2. 검색 성능 측정...');
    const searchQueries = [
      '암 치료',
      '의료기기',
      '임상시험',
      '약물 승인',
      '보험 급여'
    ];
    
    for (const query of searchQueries) {
      const searchStart = Date.now();
      const results = await dataModule.search(query, 5);
      const searchTime = Date.now() - searchStart;
      
      console.log(`검색: "${query}" - ${searchTime}ms (${results.length}개 결과)`);
    }
    
    // 3. 메모리 사용량 확인
    console.log('\n3. 메모리 사용량 확인...');
    const memUsage = process.memoryUsage();
    console.log(`RSS: ${Math.round(memUsage.rss / 1024 / 1024)}MB`);
    console.log(`Heap Used: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`);
    console.log(`Heap Total: ${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`);
    
    // 4. 벡터 스토어 정보 확인
    if (dataModule.vectorStore) {
      console.log('\n4. 벡터 스토어 정보...');
      try {
        // Chroma 컬렉션 정보 확인
        const collection = dataModule.vectorStore.collection;
        if (collection) {
          const count = await collection.count();
          console.log(`총 문서 수: ${count}`);
        }
      } catch (error) {
        console.log('벡터 스토어 정보 확인 실패:', error.message);
      }
    }
    
  } catch (error) {
    console.error('성능 테스트 중 오류:', error);
  }
  
  console.log('\n=== 성능 테스트 완료 ===');
}

// 스크립트 실행
performanceTest().catch(console.error); 
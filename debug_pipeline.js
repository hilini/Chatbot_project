import { EnhancedDataModule } from './server/utils/enhanced_data_module.js';
import fs from 'fs';
import path from 'path';

async function debugPipeline() {
  console.log('=== 파이프라인 디버깅 시작 ===');
  
  const dataModule = new EnhancedDataModule();
  
  try {
    // 1. Chroma 서버 연결 확인
    console.log('\n1. Chroma 서버 연결 확인...');
    const isChromaRunning = await dataModule.checkChromaServer();
    if (!isChromaRunning) {
      console.log('Chroma 서버가 실행되지 않았습니다. 테스트를 중단합니다.');
      return;
    }
    
    // 2. 메타데이터 확인
    console.log('\n2. 현재 메타데이터 확인...');
    const metadata = dataModule.getMetadata();
    console.log('메타데이터:', JSON.stringify(metadata, null, 2));
    
    // 3. 작은 규모로 동기화 테스트 (1개 게시글만)
    console.log('\n3. 작은 규모 동기화 테스트...');
    const result = await dataModule.syncBoard('HIRAA030023010000', 1);
    console.log('동기화 결과:', result);
    
    // 4. 벡터 스토어 상태 확인
    console.log('\n4. 벡터 스토어 상태 확인...');
    if (dataModule.vectorStore) {
      console.log('벡터 스토어가 초기화되었습니다.');
    } else {
      console.log('벡터 스토어가 초기화되지 않았습니다.');
    }
    
  } catch (error) {
    console.error('디버깅 중 오류 발생:', error);
  }
  
  console.log('\n=== 파이프라인 디버깅 완료 ===');
}

// 스크립트 실행
debugPipeline().catch(console.error); 
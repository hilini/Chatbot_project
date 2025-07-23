import enhancedDataModule from './enhanced_data_module.js';

async function testEnhancedModule() {
  console.log('=== Enhanced Data Module 테스트 시작 ===\n');
  
  try {
    // 1. 메타데이터 조회
    console.log('1. 메타데이터 조회:');
    const metadata = enhancedDataModule.getMetadata();
    console.log('현재 메타데이터:', JSON.stringify(metadata, null, 2));
    console.log('');
    
    // 2. 전체 동기화 실행 (가장 최근 1개만)
    console.log('2. 전체 동기화 실행 (가장 최근 1개만):');
    const syncResults = await enhancedDataModule.sync();
    console.log('동기화 결과:', JSON.stringify(syncResults, null, 2));
    console.log('');
    
    // 3. 검색 테스트
    console.log('3. 검색 테스트:');
    const searchResults = await enhancedDataModule.searchWithSources('항암', 3);
    console.log('검색 결과:', JSON.stringify(searchResults, null, 2));
    console.log('');
    
    // 4. 업데이트된 메타데이터 조회
    console.log('4. 업데이트된 메타데이터 조회:');
    const updatedMetadata = enhancedDataModule.getMetadata();
    console.log('업데이트된 메타데이터:', JSON.stringify(updatedMetadata, null, 2));
    
  } catch (error) {
    console.error('테스트 중 오류 발생:', error);
  }
  
  console.log('\n=== 테스트 완료 ===');
}

// 테스트 실행
testEnhancedModule().catch(console.error); 
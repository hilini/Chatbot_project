import enhancedDataModule from './server/utils/enhanced_data_module.js';

async function testEnhancedSearch() {
  console.log('=== 향상된 검색 기능 테스트 ===\n');

  // 1. 동기화 실행 (데이터 수집)
  console.log('1. 데이터 동기화 시작...');
  const syncResult = await enhancedDataModule.syncBoard('HIRAA030023010000', 2);
  console.log('동기화 결과:', syncResult);

  // 2. 하이브리드 검색 테스트
  console.log('\n2. 하이브리드 검색 테스트...');
  
  const testQueries = [
    '펨브롤리주맙 급여기준',
    '키트루다 적응증',
    '면역항암제 부작용',
    '폐암 치료'
  ];

  for (const query of testQueries) {
    console.log(`\n--- 쿼리: "${query}" ---`);
    
    try {
      const result = await enhancedDataModule.searchWithSources(query, 3);
      
      console.log(`검색 결과: ${result.results.length}개`);
      console.log(`소스: ${result.sources.length}개`);
      
      result.results.forEach((r, i) => {
        console.log(`\n결과 ${i + 1}:`);
        console.log(`- 점수: ${r.score}`);
        console.log(`- 검색 타입: ${r.searchType}`);
        console.log(`- 섹션: ${r.sourceInfo.section || 'N/A'}`);
        console.log(`- 내용: ${r.content.substring(0, 200)}...`);
      });
      
    } catch (error) {
      console.error(`검색 오류 (${query}):`, error.message);
    }
  }

  // 3. 섹션별 검색 테스트
  console.log('\n3. 섹션별 검색 테스트...');
  
  const sections = ['급여기준', '적응증', '부작용'];
  
  for (const section of sections) {
    console.log(`\n--- 섹션: "${section}" ---`);
    
    try {
      const results = await enhancedDataModule.hybridSearch.searchBySection('펨브롤리주맙', section, 2);
      
      console.log(`섹션별 검색 결과: ${results.length}개`);
      
      results.forEach((r, i) => {
        console.log(`\n결과 ${i + 1}:`);
        console.log(`- 점수: ${r.score}`);
        console.log(`- 내용: ${r.content.substring(0, 200)}...`);
      });
      
    } catch (error) {
      console.error(`섹션별 검색 오류 (${section}):`, error.message);
    }
  }

  console.log('\n=== 테스트 완료 ===');
}

// 테스트 실행
testEnhancedSearch().catch(console.error); 
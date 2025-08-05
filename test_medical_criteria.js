import fetch from 'node-fetch';

// 의료급여 기준 분석 테스트 질문들
const testQuestions = [
  "B-ALL Ph(+)에서 induction후 CR인데 MRD만 양성인 경우 blinatumomab을 급여로 사용할 수 있어?",
  "HER2 양성 유방암에서 trastuzumab + pertuzumab + docetaxel 요법의 급여 기준은?",
  "EGFR T790M 돌연변이가 있는 비소세포폐암에서 osimertinib의 2차 요법 급여 조건은?",
  "ALK 양성 비소세포폐암에서 alectinib의 1차 요법 급여 기준은?",
  "BRAF V600E 돌연변이가 있는 흑색종에서 dabrafenib + trametinib 요법의 급여 조건은?"
];

async function testMedicalCriteriaAnalysis() {
  console.log('🏥 의료급여 기준 분석 시스템 테스트 시작\n');
  
  for (let i = 0; i < testQuestions.length; i++) {
    const question = testQuestions[i];
    console.log(`\n📝 질문 ${i + 1}: ${question}`);
    console.log('─'.repeat(80));
    
    try {
      const response = await fetch('http://localhost:3001/api/analyze-medical-criteria', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: question
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        
        console.log(`\n📋 **분석 결과**`);
        console.log(`결정: ${data.analysis.decision}`);
        console.log(`신뢰도: ${(data.analysis.confidence * 100).toFixed(1)}%`);
        
        console.log(`\n📊 **요약**`);
        console.log(`- 급여가능 요소: ${data.analysis.summary.급여가능}개`);
        console.log(`- 급여불가 요소: ${data.analysis.summary.급여불가}개`);
        
        console.log(`\n📝 **상세 근거**`);
        if (data.analysis.details.식약처허가사항.length > 0) {
          console.log(`\n식약처 허가사항:`);
          data.analysis.details.식약처허가사항.forEach(factor => {
            console.log(`  - ${factor.description}`);
          });
        }
        
        if (data.analysis.details.HIRA급여기준.length > 0) {
          console.log(`\nHIRA 급여기준:`);
          data.analysis.details.HIRA급여기준.forEach(factor => {
            console.log(`  - ${factor.description}`);
          });
        }
        
        console.log(`\n💡 **권장사항**`);
        console.log(data.analysis.recommendation);
        
        if (data.analysis.relevantProtocols.length > 0) {
          console.log(`\n🔍 **관련 프로토콜**`);
          data.analysis.relevantProtocols.forEach(protocol => {
            console.log(`  - ${protocol.code}: ${protocol.cancerType} - ${protocol.treatment}`);
          });
        }
        
      } else {
        const errorData = await response.json();
        console.log(`❌ 오류: ${errorData.error}`);
      }
      
    } catch (error) {
      console.log(`❌ 네트워크 오류: ${error.message}`);
    }
    
    console.log('\n' + '='.repeat(80));
  }
  
  console.log('\n✅ 의료급여 기준 분석 테스트 완료');
}

// 테스트 실행
testMedicalCriteriaAnalysis().catch(console.error); 
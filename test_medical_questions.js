import fetch from 'node-fetch';

// 의료 전문 질문들
const medicalQuestions = [
  "B-ALL Ph(+)에서 induction후 CR인데 MRD만 양성인 경우 blinatumomab을 급여로 사용할 수 있어?",
  "HER2 양성 유방암에서 trastuzumab + pertuzumab + docetaxel 요법의 급여 기준은?",
  "EGFR T790M 돌연변이가 있는 비소세포폐암에서 osimertinib의 2차 요법 급여 조건은?",
  "ALK 양성 비소세포폐암에서 alectinib의 1차 요법 급여 기준은?",
  "BRAF V600E 돌연변이가 있는 흑색종에서 dabrafenib + trametinib 요법의 급여 조건은?"
];

async function testMedicalQuestions() {
  console.log('🏥 의료 전문 질문 테스트 시작\n');
  
  for (let i = 0; i < medicalQuestions.length; i++) {
    const question = medicalQuestions[i];
    console.log(`\n📝 질문 ${i + 1}: ${question}`);
    console.log('─'.repeat(80));
    
    try {
      const response = await fetch('http://localhost:3001/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: question,
          history: []
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        
        console.log(`🤖 답변: ${data.content}`);
        
        if (data.sources && data.sources.length > 0) {
          console.log(`\n📚 참고 소스 (${data.sources.length}개):`);
          data.sources.forEach((source, idx) => {
            console.log(`  ${idx + 1}. ${source.title} (게시글 #${source.postNo})`);
            if (source.filename) {
              console.log(`     📄 파일: ${source.filename}`);
            }
            if (source.score) {
              console.log(`     📊 관련도: ${source.score.toFixed(2)}`);
            }
          });
        } else {
          console.log('⚠️  참고 소스가 없습니다.');
        }
        
        // 답변 품질 평가
        console.log('\n📊 답변 품질 평가:');
        const hasSpecificInfo = data.content.includes('급여') || data.content.includes('조건') || data.content.includes('기준');
        const hasDrugInfo = data.content.includes('blinatumomab') || data.content.includes('trastuzumab') || data.content.includes('osimertinib');
        const hasMedicalTerms = data.content.includes('B-ALL') || data.content.includes('Ph(+)') || data.content.includes('MRD');
        
        console.log(`   - 구체적 정보 포함: ${hasSpecificInfo ? '✅' : '❌'}`);
        console.log(`   - 약물 정보 포함: ${hasDrugInfo ? '✅' : '❌'}`);
        console.log(`   - 의학 용어 포함: ${hasMedicalTerms ? '✅' : '❌'}`);
        
      } else {
        console.log(`❌ 오류: ${response.status} ${response.statusText}`);
      }
      
    } catch (error) {
      console.log(`❌ 네트워크 오류: ${error.message}`);
    }
    
    console.log('\n' + '='.repeat(80));
    
    // 요청 간 간격
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  
  console.log('\n✅ 의료 전문 질문 테스트 완료!');
}

// 테스트 실행
testMedicalQuestions().catch(console.error); 
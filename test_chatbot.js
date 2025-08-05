import fetch from 'node-fetch';

// 테스트 질문들
const testQuestions = [
  "펨브롤리주맙은 어떤 암에 사용되나요?",
  "키트루다의 급여 기준은 무엇인가요?",
  "면역항암제의 부작용은 무엇인가요?",
  "항암화학요법의 일반적인 투여 방법은?",
  "2025년에 신설된 항암요법이 있나요?"
];

async function testChatbot() {
  console.log('🤖 챗봇 문서 기반 답변 테스트 시작\n');
  
  for (let i = 0; i < testQuestions.length; i++) {
    const question = testQuestions[i];
    console.log(`\n📝 질문 ${i + 1}: ${question}`);
    console.log('─'.repeat(50));
    
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
        
        if (data.metadata) {
          console.log(`\n📊 메타데이터:`);
          console.log(`   - 모델: ${data.metadata.modelName || 'N/A'}`);
          console.log(`   - 소스 페이지: ${data.metadata.sourcePages || 0}개`);
        }
        
      } else {
        console.log(`❌ 오류: ${response.status} ${response.statusText}`);
      }
      
    } catch (error) {
      console.log(`❌ 네트워크 오류: ${error.message}`);
    }
    
    console.log('\n' + '='.repeat(60));
    
    // 요청 간 간격
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  console.log('\n✅ 테스트 완료!');
}

// 테스트 실행
testChatbot().catch(console.error); 
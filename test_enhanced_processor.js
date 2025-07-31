import EnhancedDocumentProcessor from './server/utils/enhanced_document_processor.js';
import path from 'path';

async function testEnhancedProcessor() {
  const processor = new EnhancedDocumentProcessor();
  
  console.log('=== 개선된 문서 처리기 테스트 ===');
  console.log('지원하는 파일 형식:', processor.getSupportedFormats());
  
  // 실제 존재하는 파일들로 테스트
  const testFiles = [
    './server/data/raw/HIRAA030023010000_215_공고전문_20250701.pdf',
    './server/data/raw/HIRAA030023010000_215_주요공고개정내역_20250701.pdf',
    './server/data/raw/HIRAA030023030000_2_허가초과 항암요법_20250701.xlsx'
  ];
  
  for (const filePath of testFiles) {
    try {
      console.log(`\n--- ${path.basename(filePath)} 처리 중 ---`);
      
      if (!processor.isSupported(filePath)) {
        console.log(`지원하지 않는 파일 형식: ${path.extname(filePath)}`);
        continue;
      }
      
      const result = await processor.processFile(filePath);
      
      console.log('처리 결과:');
      console.log('- 성공:', result.success);
      console.log('- 메서드:', result.metadata?.method || 'N/A');
      console.log('- 페이지 수:', result.metadata?.pages || 'N/A');
      console.log('- 파일 크기:', result.metadata?.fileSize || 'N/A');
      
      if (result.success) {
        console.log('- 내용 미리보기 (처음 200자):');
        console.log(result.content.substring(0, 200) + '...');
      } else {
        console.log('- 오류:', result.error);
      }
      
    } catch (error) {
      console.error(`파일 처리 중 오류 (${path.basename(filePath)}):`, error.message);
    }
  }
  
  console.log('\n=== 테스트 완료 ===');
}

// 테스트 실행
testEnhancedProcessor().catch(console.error); 
import EnhancedDocumentProcessor from './server/utils/enhanced_document_processor.js';
import fs from 'fs';
import path from 'path';

async function testExcelProcessing() {
  const processor = new EnhancedDocumentProcessor();
  const excelFilePath = './server/data/raw/HIRAA030023030000_2_허가초과 항암요법_20250701.xlsx';
  
  console.log('엑셀 파일 처리 테스트 시작...');
  console.log(`파일 경로: ${excelFilePath}`);
  
  if (!fs.existsSync(excelFilePath)) {
    console.error('엑셀 파일이 존재하지 않습니다!');
    return;
  }
  
  try {
    const result = await processor.processFile(excelFilePath);
    
    if (result.success) {
      console.log('✅ 엑셀 파일 처리 성공!');
      console.log(`📄 파일명: ${result.metadata.filename}`);
      console.log(`📊 시트 수: ${result.metadata.pages}`);
      console.log(`📏 텍스트 길이: ${result.content.length} 문자`);
      console.log(`🔧 처리 방법: ${result.metadata.method}`);
      
      // 텍스트 미리보기
      console.log('\n📝 텍스트 미리보기 (처음 500자):');
      console.log('='.repeat(50));
      console.log(result.content.substring(0, 500));
      console.log('='.repeat(50));
      
      // metadata.json에 추가할 데이터 구조
      const metadataEntry = {
        boardId: "HIRAA030023030000",
        postNo: "2",
        filename: result.metadata.filename,
        filePath: path.resolve(excelFilePath),
        textContent: result.content,
        processedAt: new Date().toISOString(),
        fileSize: result.metadata.fileSize
      };
      
      console.log('\n📋 metadata.json에 추가할 엔트리:');
      console.log(JSON.stringify(metadataEntry, null, 2));
      
    } else {
      console.error('❌ 엑셀 파일 처리 실패:', result.error);
    }
    
  } catch (error) {
    console.error('❌ 처리 중 오류 발생:', error);
  }
}

testExcelProcessing(); 
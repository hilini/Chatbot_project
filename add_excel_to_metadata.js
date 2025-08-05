import EnhancedDocumentProcessor from './server/utils/enhanced_document_processor.js';
import fs from 'fs';
import path from 'path';

async function addExcelToMetadata() {
  const processor = new EnhancedDocumentProcessor();
  const excelFilePath = './server/data/raw/HIRAA030023030000_2_허가초과 항암요법_20250701.xlsx';
  const metadataPath = './server/data/vector/metadata.json';
  
  console.log('엑셀 파일을 metadata.json에 추가하는 중...');
  
  try {
    // 1. 엑셀 파일 처리
    const result = await processor.processFile(excelFilePath);
    
    if (!result.success) {
      console.error('❌ 엑셀 파일 처리 실패:', result.error);
      return;
    }
    
    console.log('✅ 엑셀 파일 처리 성공!');
    
    // 2. metadata.json 읽기
    const metadataContent = fs.readFileSync(metadataPath, 'utf-8');
    const metadata = JSON.parse(metadataContent);
    
    // 3. 새로운 엔트리 생성
    const excelEntry = {
      boardId: "HIRAA030023030000",
      postNo: "2",
      filename: result.metadata.filename,
      filePath: path.resolve(excelFilePath),
      textContent: result.content,
      processedAt: new Date().toISOString(),
      fileSize: result.metadata.fileSize
    };
    
    // 4. metadata.json에 추가
    const fileKey = `HIRAA030023030000_2_${result.metadata.filename}`;
    metadata.files[fileKey] = excelEntry;
    
    // 5. lastSync 업데이트
    metadata.lastSync = new Date().toISOString();
    
    // 6. metadata.json 저장
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');
    
    console.log('✅ metadata.json에 엑셀 파일이 성공적으로 추가되었습니다!');
    console.log(`📄 추가된 파일: ${fileKey}`);
    console.log(`📏 텍스트 길이: ${result.content.length} 문자`);
    console.log(`📊 시트 수: ${result.metadata.pages}`);
    
    // 7. 텍스트 미리보기
    console.log('\n📝 처리된 엑셀 내용 미리보기 (처음 300자):');
    console.log('='.repeat(50));
    console.log(result.content.substring(0, 300));
    console.log('='.repeat(50));
    
  } catch (error) {
    console.error('❌ 오류 발생:', error);
  }
}

addExcelToMetadata(); 
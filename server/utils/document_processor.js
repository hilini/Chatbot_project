const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { RecursiveCharacterTextSplitter } = require('langchain/text_splitter');
const MedicalChunker = require('./medical_chunker');
const { processPDF } = require('./pdfProcessor');

class DocumentProcessor {
  constructor() {
    this.medicalChunker = new MedicalChunker();
    this.textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 800,
      chunkOverlap: 200,
    });
  }

  // 파일 형식별 처리 메서드
  async processFile(filePath, metadata = {}) {
    const fileExtension = path.extname(filePath).toLowerCase();
    const filename = path.basename(filePath);

    try {
      let content = '';
      let structuredData = null;

      switch (fileExtension) {
        case '.pdf':
          content = await this.processPdfFile(filePath, metadata);
          break;
        case '.xlsx':
        case '.xls':
          const excelResult = await this.processExcelFile(filePath, metadata);
          content = excelResult.content;
          structuredData = excelResult.structuredData;
          break;
        case '.txt':
        case '.json':
        case '.csv':
        case '.md':
        case '.log':
        case '.xml':
        case '.html':
          content = await this.processTextFile(filePath, metadata);
          break;
        case '.doc':
        case '.docx':
          content = await this.processWordFile(filePath, metadata);
          break;
        case '.hwp':
          content = await this.processHwpFile(filePath, metadata);
          break;
        default:
          content = `[지원하지 않는 파일 형식: ${fileExtension}]`;
      }

      // 청킹 처리
      const chunks = await this.chunkContent(content, {
        ...metadata,
        filename,
        filePath,
        fileExtension,
        hasStructuredData: !!structuredData
      });

      return {
        content,
        chunks,
        structuredData,
        metadata: {
          ...metadata,
          filename,
          filePath,
          fileExtension,
          processedAt: new Date().toISOString()
        }
      };

    } catch (error) {
      console.error(`파일 처리 오류 (${filename}):`, error);
      throw error;
    }
  }

  // PDF 파일 처리
  async processPdfFile(filePath, metadata) {
    try {
      console.log(`PDF 파일 처리 시작: ${filePath}`);
      
      // 기존의 잘 작동하는 pdfProcessor 사용
      const result = await processPDF(filePath, metadata);
      
      console.log(`PDF 처리 완료: ${result.message}`);
      
      // 텍스트 파일로 저장 (캐싱)
      const textDir = path.join(__dirname, '../data/text');
      if (!fs.existsSync(textDir)) {
        fs.mkdirSync(textDir, { recursive: true });
      }
      const textFileName = path.basename(filePath, '.pdf') + '.txt';
      const textFilePath = path.join(textDir, textFileName);
      
      // PDF에서 추출된 텍스트를 파일로 저장
      if (result.textContent) {
        fs.writeFileSync(textFilePath, result.textContent, 'utf-8');
      }
      
      // PDF 내용을 구조화하여 반환
      return this.structurePdfContent(result.textContent || '', metadata);
      
    } catch (error) {
      console.error(`PDF 파일 처리 오류 (${filePath}):`, error);
      
      // 텍스트 파일이 있는지 확인 (백업)
      const textDir = path.join(__dirname, '../data/text');
      const textFileName = path.basename(filePath, '.pdf') + '.txt';
      const textFilePath = path.join(textDir, textFileName);
      
      if (fs.existsSync(textFilePath)) {
        console.log(`텍스트 파일에서 읽기: ${textFilePath}`);
        const textContent = fs.readFileSync(textFilePath, 'utf-8');
        return this.structurePdfContent(textContent, metadata);
      } else {
        return '[PDF 파일 처리 실패 - 텍스트 추출 불가]';
      }
    }
  }

  // PDF 내용 구조화
  structurePdfContent(textContent, metadata) {
    const structuredContent = {
      title: '',
      sections: {},
      drugs: {},
      reimbursementCriteria: {}
    };

    // 제목 추출
    const titleMatch = textContent.match(/제목:\s*(.+)/);
    if (titleMatch) {
      structuredContent.title = titleMatch[1].trim();
    }

    // 약물별 급여기준 추출
    const drugPatterns = [
      /([가-힣]+주맙|키트루다|옵디보|테센트릭|이미피니|암비솜|보리코나졸|포사코나졸|간시클로비르|마리바비르)/g,
      /([A-Z][a-z]+umab|mab$)/g
    ];

    // 급여기준 섹션 추출
    const reimbursementSections = textContent.split(/(급여기준|보험급여|급여인정|급여기준인정)/i);
    
    for (let i = 1; i < reimbursementSections.length; i += 2) {
      const sectionType = reimbursementSections[i];
      const sectionContent = reimbursementSections[i + 1] || '';
      
      if (sectionContent) {
        structuredContent.sections[sectionType] = sectionContent.trim();
        
        // 약물별 정보 추출
        drugPatterns.forEach(pattern => {
          const matches = sectionContent.match(pattern);
          if (matches) {
            matches.forEach(drug => {
              if (!structuredContent.drugs[drug]) {
                structuredContent.drugs[drug] = [];
              }
              structuredContent.drugs[drug].push({
                section: sectionType,
                content: sectionContent.substring(0, 500) + '...',
                source: metadata.filename
              });
            });
          }
        });
      }
    }

    // 구조화된 내용을 텍스트로 변환
    let structuredText = '';
    
    if (structuredContent.title) {
      structuredText += `제목: ${structuredContent.title}\n\n`;
    }

    // 약물별 급여기준 정보 추가
    for (const [drug, criteria] of Object.entries(structuredContent.drugs)) {
      structuredText += `\n=== ${drug} 급여기준 ===\n`;
      criteria.forEach(criterion => {
        structuredText += `[${criterion.section}]\n${criterion.content}\n\n`;
      });
    }

    // 일반 섹션 정보 추가
    for (const [sectionName, content] of Object.entries(structuredContent.sections)) {
      structuredText += `\n=== ${sectionName} ===\n${content}\n`;
    }

    return structuredText || textContent;
  }

  // Excel 시트 내용 구조화
  structureExcelSheetContent(sheetName, data) {
    let structuredContent = `[시트: ${sheetName}]\n`;
    structuredContent += `행 수: ${data.length}\n`;
    structuredContent += `열 수: ${Math.max(...data.map(row => row.length))}\n\n`;

    // 헤더 행 찾기
    let headerRow = null;
    let dataStartRow = 0;
    
    for (let i = 0; i < Math.min(10, data.length); i++) {
      const row = data[i];
      if (row && row.some(cell => 
        typeof cell === 'string' && 
        (cell.includes('약품명') || cell.includes('약제명') || cell.includes('적응증') || cell.includes('급여'))
      )) {
        headerRow = row;
        dataStartRow = i + 1;
        break;
      }
    }

    if (headerRow) {
      structuredContent += `헤더: ${headerRow.join(' | ')}\n\n`;
      
      // 데이터 행들을 약물별로 그룹화
      const drugGroups = {};
      
      for (let i = dataStartRow; i < data.length; i++) {
        const row = data[i];
        if (!row || row.length === 0) continue;
        
        // 약물명 추출 (첫 번째 컬럼 또는 약품명 컬럼)
        let drugName = '';
        if (headerRow.includes('약품명') || headerRow.includes('약제명')) {
          const drugColIndex = headerRow.findIndex(cell => 
            cell.includes('약품명') || cell.includes('약제명')
          );
          drugName = row[drugColIndex] || '';
        } else {
          drugName = row[0] || '';
        }
        
        if (drugName && drugName.trim()) {
          if (!drugGroups[drugName]) {
            drugGroups[drugName] = [];
          }
          drugGroups[drugName].push(row);
        }
      }
      
      // 약물별로 구조화된 내용 생성
      for (const [drug, rows] of Object.entries(drugGroups)) {
        structuredContent += `--- ${drug} ---\n`;
        rows.forEach((row, index) => {
          structuredContent += `  ${index + 1}. ${row.join(' | ')}\n`;
        });
        structuredContent += '\n';
      }
    } else {
      // 헤더가 없는 경우 일반적인 형태로 출력
      data.forEach((row, rowIndex) => {
        if (row && row.length > 0) {
          structuredContent += `행 ${rowIndex + 1}: ${row.join(' | ')}\n`;
        }
      });
    }
    
    return structuredContent;
  }

  // Excel 파일 처리
  async processExcelFile(filePath, metadata) {
    const workbook = XLSX.readFile(filePath);
    const sheets = workbook.SheetNames;
    let allContent = [];
    const structuredData = {
      sheets: [],
      summary: {
        totalSheets: sheets.length,
        totalRows: 0,
        totalColumns: 0
      }
    };

    sheets.forEach((sheetName, sheetIndex) => {
      const sheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
      
      // 빈 행 제거
      const filteredData = data.filter(row => row && row.some(cell => cell !== null && cell !== ''));
      
      if (filteredData.length > 0) {
        // 시트별 구조화된 데이터
        const sheetData = {
          name: sheetName,
          index: sheetIndex,
          rows: filteredData.length,
          columns: Math.max(...filteredData.map(row => row.length)),
          data: filteredData,
          headers: filteredData[0] || []
        };

        structuredData.sheets.push(sheetData);
        structuredData.summary.totalRows += filteredData.length;
        structuredData.summary.totalColumns = Math.max(
          structuredData.summary.totalColumns, 
          Math.max(...filteredData.map(row => row.length))
        );

        // 시트별 텍스트 내용 생성 (의료 문서에 맞게 구조화)
        const sheetContent = this.structureExcelSheetContent(sheetName, filteredData);
        allContent.push(sheetContent);
      }
    });

    return {
      content: allContent.join('\n\n'),
      structuredData
    };
  }

  // 텍스트 파일 처리
  async processTextFile(filePath, metadata) {
    const content = fs.readFileSync(filePath, 'utf-8');
    
    // CSV 파일인 경우 특별 처리
    if (path.extname(filePath).toLowerCase() === '.csv') {
      return this.processCsvContent(content);
    }
    
    return content;
  }

  // CSV 내용 처리
  processCsvContent(content) {
    const lines = content.split('\n').filter(line => line.trim());
    if (lines.length === 0) return content;

    const headers = lines[0].split(',').map(h => h.trim());
    const data = lines.slice(1).map(line => {
      const values = line.split(',').map(v => v.trim());
      return values;
    });

    return [
      `[CSV 데이터]`,
      `헤더: ${headers.join(' | ')}`,
      `총 행 수: ${data.length}`,
      '',
      ...data.map((row, index) => {
        const rowText = row.map((cell, cellIndex) => 
          `${headers[cellIndex] || `열${cellIndex + 1}`}: ${cell}`
        ).join(' | ');
        return `행 ${index + 1}: ${rowText}`;
      })
    ].join('\n');
  }

  // Word 파일 처리 (향후 구현)
  async processWordFile(filePath, metadata) {
    // Word 파일 처리를 위한 라이브러리 필요 (mammoth.js 등)
    return '[Word 파일 - 처리 기능 개발 중]';
  }

  // HWP 파일 처리 (향후 구현)
  async processHwpFile(filePath, metadata) {
    // HWP 파일 처리를 위한 라이브러리 필요
    return '[HWP 파일 - 처리 기능 개발 중]';
  }

  // 내용 청킹
  async chunkContent(content, metadata) {
    if (!content || content.trim() === '') {
      return [];
    }

    // 의료 문서인 경우 특화 청킹 사용
    if (metadata.type === 'medical' || 
        content.includes('의료') || 
        content.includes('환자') || 
        content.includes('진료')) {
      return await this.medicalChunker.chunkMedicalDocument(content, metadata);
    }

    // 일반 문서는 기본 청킹 사용
    const chunks = await this.textSplitter.splitText(content);
    
    return chunks.map((chunk, index) => ({
      pageContent: chunk,
      metadata: {
        ...metadata,
        chunkIndex: index,
        totalChunks: chunks.length,
        chunkType: 'general'
      }
    }));
  }

  // 구조화된 데이터에서 검색
  searchInStructuredData(structuredData, query) {
    const results = [];
    const queryLower = query.toLowerCase();

    if (structuredData.sheets) {
      // Excel 데이터 검색
      structuredData.sheets.forEach(sheet => {
        sheet.data.forEach((row, rowIndex) => {
          row.forEach((cell, cellIndex) => {
            if (cell && cell.toString().toLowerCase().includes(queryLower)) {
              results.push({
                type: 'excel',
                sheet: sheet.name,
                row: rowIndex + 1,
                column: cellIndex + 1,
                value: cell,
                context: row.join(' | ')
              });
            }
          });
        });
      });
    }

    return results;
  }

  // 문서 요약 생성
  generateDocumentSummary(processedData) {
    const { content, structuredData, metadata } = processedData;
    
    const summary = {
      filename: metadata.filename,
      fileType: metadata.fileExtension,
      contentLength: content.length,
      chunkCount: processedData.chunks.length,
      processedAt: metadata.processedAt
    };

    if (structuredData && structuredData.sheets) {
      summary.excelInfo = {
        sheetCount: structuredData.sheets.length,
        totalRows: structuredData.summary.totalRows,
        totalColumns: structuredData.summary.totalColumns,
        sheets: structuredData.sheets.map(sheet => ({
          name: sheet.name,
          rows: sheet.rows,
          columns: sheet.columns
        }))
      };
    }

    return summary;
  }

  // 배치 처리
  async processBatch(files, metadata = {}) {
    const results = [];
    
    for (const file of files) {
      try {
        const result = await this.processFile(file, metadata);
        results.push(result);
      } catch (error) {
        console.error(`배치 처리 오류 (${file}):`, error);
        results.push({
          error: error.message,
          file,
          metadata
        });
      }
    }

    return results;
  }
}

module.exports = DocumentProcessor; 
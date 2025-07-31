import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { promisify } from 'util';

class EnhancedDocumentProcessor {
  constructor() {
    this.supportedFormats = {
      '.pdf': this.processPdf.bind(this),
      '.docx': this.processDocx.bind(this),
      '.doc': this.processDoc.bind(this),
      '.txt': this.processText.bind(this),
      '.json': this.processText.bind(this),
      '.csv': this.processText.bind(this),
      '.xlsx': this.processExcel.bind(this),
      '.xls': this.processExcel.bind(this),
      '.hwp': this.processHwp.bind(this)
    };
  }

  // 메인 처리 함수
  async processFile(filePath, options = {}) {
    const fileExtension = path.extname(filePath).toLowerCase();
    const processor = this.supportedFormats[fileExtension];
    
    if (!processor) {
      console.warn(`지원하지 않는 파일 형식: ${fileExtension}`);
      return {
        success: false,
        content: '',
        error: `지원하지 않는 파일 형식: ${fileExtension}`,
        metadata: {
          filename: path.basename(filePath),
          fileExtension,
          fileSize: fs.statSync(filePath).size
        }
      };
    }

    try {
      console.log(`파일 처리 시작: ${path.basename(filePath)} (${fileExtension})`);
      const result = await processor(filePath, options);
      
      return {
        success: true,
        content: result.content || '',
        metadata: {
          filename: path.basename(filePath),
          fileExtension,
          fileSize: fs.statSync(filePath).size,
          pages: result.pages || 1,
          language: result.language || 'ko',
          ...result.metadata
        }
      };
    } catch (error) {
      console.error(`파일 처리 실패 (${path.basename(filePath)}):`, error);
      return {
        success: false,
        content: '',
        error: error.message,
        metadata: {
          filename: path.basename(filePath),
          fileExtension,
          fileSize: fs.statSync(filePath).size
        }
      };
    }
  }

  // PDF 처리 (개선된 버전)
  async processPdf(filePath, options = {}) {
    try {
      // 1. 먼저 pdf-parse 시도
      try {
        const dataBuffer = fs.readFileSync(filePath);
        const pdfParse = await import('pdf-parse');
        const data = await pdfParse.default(dataBuffer);
        
        console.log(`pdf-parse 결과 - 텍스트 길이: ${data.text ? data.text.length : 0}`);
        console.log(`pdf-parse 결과 - 페이지 수: ${data.numpages}`);
        console.log(`pdf-parse 결과 - 텍스트 미리보기: ${data.text ? data.text.substring(0, 100) : '없음'}`);
        
        if (data.text && data.text.trim().length > 0) {
          console.log(`PDF 텍스트 추출 성공 (pdf-parse): ${data.numpages}페이지`);
          return {
            content: data.text,
            pages: data.numpages,
            method: 'pdf-parse'
          };
        } else {
          console.log('pdf-parse에서 텍스트가 비어있음');
        }
      } catch (pdfError) {
        console.log(`pdf-parse 실패: ${pdfError.message}`);
        // pdf-parse 실패 시 바로 OCR로 넘어감
      }

      // 2. Python 스크립트를 통한 OCR 시도
      console.log('OCR 처리 시작...');
      try {
        const result = await this.runPythonOcr(filePath);
        console.log('OCR 결과:', result);
        if (result.success && result.content.trim().length > 0) {
          console.log(`PDF OCR 처리 성공: ${result.pages}페이지`);
          return {
            content: result.content,
            pages: result.pages,
            method: 'ocr'
          };
        } else {
          console.log('OCR 결과가 비어있거나 실패:', result);
        }
      } catch (ocrError) {
        console.log(`OCR 처리 실패: ${ocrError.message}`);
      }

      // 3. 대체 방법: 파일 정보만 반환
      const stats = fs.statSync(filePath);
      return {
        content: `[PDF 파일: ${path.basename(filePath)}, 크기: ${stats.size} bytes, 처리 불가]`,
        pages: 1,
        method: 'fallback'
      };

    } catch (error) {
      throw new Error(`PDF 처리 실패: ${error.message}`);
    }
  }

  // Python OCR 실행 (pdftotext 기반)
  async runPythonOcr(filePath) {
    return new Promise((resolve, reject) => {
      const pythonScript = `
import json
import sys
import os
import subprocess

try:
    def extract_text_with_pdftotext(pdf_path):
        try:
            # pdftotext 명령어 사용 (시스템에 설치되어 있어야 함)
            result = subprocess.run(['pdftotext', pdf_path, '-'], 
                                  capture_output=True, text=True, timeout=30)
            
            if result.returncode == 0 and result.stdout.strip():
                text = result.stdout
                # 페이지 수는 대략적으로 추정
                pages = text.count('\\f') + 1
                return {"success": True, "content": text, "pages": pages, "method": "pdftotext"}
            else:
                return {"success": False, "error": "pdftotext failed"}
                
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    result = extract_text_with_pdftotext('${filePath}')
    print(json.dumps(result))
    
except ImportError as e:
    print(json.dumps({"success": False, "error": f"Import error: {e}"}))
except Exception as e:
    print(json.dumps({"success": False, "error": str(e)}))
`;

      const pythonProcess = spawn('python', ['-c', pythonScript]);
      let output = '';
      let errorOutput = '';

      pythonProcess.stdout.on('data', (data) => {
        output += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      pythonProcess.on('close', (code) => {
        if (code === 0) {
          try {
            const result = JSON.parse(output.trim());
            resolve(result);
          } catch (parseError) {
            reject(new Error(`OCR 결과 파싱 실패: ${parseError.message}`));
          }
        } else {
          reject(new Error(`Python OCR 실행 실패: ${errorOutput}`));
        }
      });
    });
  }

  // DOCX 처리
  async processDocx(filePath, options = {}) {
    try {
      const pythonScript = `
import sys
import os
sys.path.append('${path.dirname(filePath)}')

try:
    from docx import Document
    
    def extract_docx_text(docx_path):
        try:
            doc = Document(docx_path)
            text = ""
            
            for paragraph in doc.paragraphs:
                if paragraph.text.strip():
                    text += paragraph.text + "\\n"
            
            for table in doc.tables:
                for row in table.rows:
                    for cell in row.cells:
                        if cell.text.strip():
                            text += cell.text + "\\t"
                    text += "\\n"
            
            return {"success": True, "content": text, "pages": 1}
            
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    result = extract_docx_text('${filePath}')
    print("DOCX_RESULT:" + str(result))
    
except ImportError as e:
    print("DOCX_RESULT:" + str({"success": False, "error": f"Import error: {e}"}))
except Exception as e:
    print("DOCX_RESULT:" + str({"success": False, "error": str(e)}))
`;

      const result = await this.runPythonScript(pythonScript, 'DOCX_RESULT:');
      
      if (result.success) {
        return {
          content: result.content,
          pages: result.pages || 1,
          method: 'python-docx'
        };
      } else {
        throw new Error(result.error);
      }

    } catch (error) {
      throw new Error(`DOCX 처리 실패: ${error.message}`);
    }
  }

  // DOC 처리
  async processDoc(filePath, options = {}) {
    try {
      const pythonScript = `
import sys
import os
sys.path.append('${path.dirname(filePath)}')

try:
    import mammoth
    
    def extract_doc_text(doc_path):
        try:
            with open(doc_path, "rb") as docx_file:
                result = mammoth.extract_raw_text(docx_file)
                text = result.value
                return {"success": True, "content": text, "pages": 1}
                
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    result = extract_doc_text('${filePath}')
    print("DOC_RESULT:" + str(result))
    
except ImportError as e:
    print("DOC_RESULT:" + str({"success": False, "error": f"Import error: {e}"}))
except Exception as e:
    print("DOC_RESULT:" + str({"success": False, "error": str(e)}))
`;

      const result = await this.runPythonScript(pythonScript, 'DOC_RESULT:');
      
      if (result.success) {
        return {
          content: result.content,
          pages: result.pages || 1,
          method: 'mammoth'
        };
      } else {
        throw new Error(result.error);
      }

    } catch (error) {
      throw new Error(`DOC 처리 실패: ${error.message}`);
    }
  }

  // HWP 처리 (한글 파일)
  async processHwp(filePath, options = {}) {
    try {
      const pythonScript = `
import sys
import os
import subprocess
import tempfile

try:
    def extract_hwp_text(hwp_path):
        try:
            # 1단계: hwp5txt 명령어 시도 (시스템에 설치되어 있는 경우)
            try:
                result = subprocess.run(['hwp5txt', hwp_path], 
                                      capture_output=True, text=True, timeout=30)
                if result.returncode == 0 and result.stdout.strip():
                    return {"success": True, "content": result.stdout, "pages": 1, "method": "hwp5txt"}
            except FileNotFoundError:
                pass
            
            # 2단계: HWP 파일 정보 추출
            with open(hwp_path, 'rb') as f:
                header = f.read(32)
                if header.startswith(b'HWP Document File'):
                    # 파일 크기와 기본 정보 추출
                    f.seek(0, 2)  # 파일 끝으로 이동
                    file_size = f.tell()
                    
                    content = f"""[HWP 파일: {os.path.basename(hwp_path)}]
파일 크기: {file_size} bytes
한글 문서입니다. 텍스트 추출을 위해서는 hwp5txt 도구가 필요합니다.

설치 방법:
- Ubuntu/Debian: sudo apt-get install hwp5-utils
- CentOS/RHEL: sudo yum install hwp5-utils
- 또는 소스에서 빌드: https://github.com/mete0r/hwp5

현재는 파일 정보만 표시됩니다."""
                    
                    return {"success": True, "content": content, "pages": 1, "method": "info"}
                else:
                    return {"success": False, "error": "유효하지 않은 HWP 파일입니다."}
                    
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    result = extract_hwp_text('${filePath}')
    print("HWP_RESULT:" + str(result))
    
except Exception as e:
    print("HWP_RESULT:" + str({"success": False, "error": str(e)}))
`;

      const result = await this.runPythonScript(pythonScript, 'HWP_RESULT:');
      
      if (result.success) {
        return {
          content: result.content,
          pages: result.pages || 1,
          method: 'hwp-info'
        };
      } else {
        throw new Error(result.error);
      }

    } catch (error) {
      throw new Error(`HWP 처리 실패: ${error.message}`);
    }
  }

  // Excel 처리 (Node.js XLSX 사용)
  async processExcel(filePath, options = {}) {
    try {
      // Node.js XLSX 라이브러리 사용
      const XLSX = await import('xlsx');
      const workbook = XLSX.default.readFile(filePath);
      
      let allText = '';
      const sheetNames = workbook.SheetNames;
      
      for (const sheetName of sheetNames) {
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.default.utils.sheet_to_json(worksheet, { header: 1 });
        
        allText += `\n=== ${sheetName} ===\n`;
        
        // 각 행을 텍스트로 변환
        for (const row of jsonData) {
          if (row && row.length > 0) {
            const rowText = row.map(cell => cell || '').join('\t');
            allText += rowText + '\n';
          }
        }
        allText += '\n';
      }
      
      return {
        content: allText,
        pages: sheetNames.length,
        method: 'xlsx'
      };

    } catch (error) {
      throw new Error(`Excel 처리 실패: ${error.message}`);
    }
  }

  // 텍스트 파일 처리
  async processText(filePath, options = {}) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      return {
        content,
        pages: 1,
        method: 'direct'
      };
    } catch (error) {
      throw new Error(`텍스트 파일 처리 실패: ${error.message}`);
    }
  }

  // Python 스크립트 실행 헬퍼 함수
  async runPythonScript(script, resultPrefix) {
    return new Promise((resolve, reject) => {
      const pythonProcess = spawn('python', ['-c', script]);
      let output = '';
      let errorOutput = '';

      pythonProcess.stdout.on('data', (data) => {
        output += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      pythonProcess.on('close', (code) => {
        console.log('Python 스크립트 출력:', output);
        console.log('Python 스크립트 오류:', errorOutput);
        console.log('Python 스크립트 종료 코드:', code);
        
        if (code === 0) {
          try {
            const match = output.match(new RegExp(resultPrefix + '(.+)'));
            if (match) {
              const result = JSON.parse(match[1]);
              resolve(result);
            } else {
              reject(new Error('Python 스크립트 결과를 파싱할 수 없습니다.'));
            }
          } catch (parseError) {
            reject(new Error(`Python 스크립트 결과 파싱 실패: ${parseError.message}`));
          }
        } else {
          reject(new Error(`Python 스크립트 실행 실패: ${errorOutput}`));
        }
      });
    });
  }

  // 지원하는 파일 형식 목록
  getSupportedFormats() {
    return Object.keys(this.supportedFormats);
  }

  // 파일 형식 지원 여부 확인
  isSupported(filePath) {
    const extension = path.extname(filePath).toLowerCase();
    return this.supportedFormats.hasOwnProperty(extension);
  }
}

export default EnhancedDocumentProcessor; 
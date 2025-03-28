/**
 * PDF 처리 및 벡터화 유틸리티
 * 
 * 이 모듈은 PDF 파일을 처리하고 내용을 추출하여 로컬 벡터 데이터베이스에 저장하는 기능을 제공합니다.
 * 각 텍스트 청크에 페이지 번호 정보를 추가하여 검색 결과에서 관련 페이지로 직접 이동할 수 있게 합니다.
 */

const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const { OpenAIEmbeddings } = require('@langchain/openai');
const { RecursiveCharacterTextSplitter } = require('langchain/text_splitter');
const { FaissStore } = require('@langchain/community/vectorstores/faiss');
const { Document } = require('langchain/document');
const config = require('../../config');

// 디렉토리 확인 및 생성 함수
function ensureDirectoryExists(directoryPath) {
  if (!fs.existsSync(directoryPath)) {
    fs.mkdirSync(directoryPath, { recursive: true });
    console.log(`디렉토리 생성됨: ${directoryPath}`);
  }
}

// 벡터 저장소 디렉토리 설정
const VECTOR_STORE_DIR = path.join(__dirname, '..', 'data', 'vector_db');
ensureDirectoryExists(VECTOR_STORE_DIR);

// OpenAI 임베딩 인스턴스 초기화
const embeddings = new OpenAIEmbeddings({
  openAIApiKey: process.env.OPENAI_API_KEY,
  modelName: config.ai.embeddingModel || 'text-embedding-ada-002'
});

// 네임스페이스 설정
const NAMESPACE = 'cancer-treatment';

/**
 * PDF 파일에서 각 페이지별 텍스트를 추출하는 향상된 함수
 */
async function extractTextFromPDF(pdfPath) {
  try {
    console.log(`PDF 파일 읽기 시작: ${pdfPath}`);
    const dataBuffer = fs.readFileSync(pdfPath);
    
    // PDF 처리 결과 저장 배열
    const pageTexts = [];
    
    // 페이지 번호 오프셋 정의 (문서 내 페이지 번호가 실제보다 4페이지 낮음)
    const PAGE_NUMBER_OFFSET = 4;
    
    // 계층 구조 정보 저장
    let currentHierarchy = {
      cancerType: null,        // 대분류: 암종 (예: 담도암)
      treatmentMethod: null,   // 중분류: 치료방법 (예: 고식적요법)
      administrationStage: null // 소분류: 투여단계 (예: 투여단계: 1차 이상)
    };
    
    // PDF 파일 파싱 - 더 정교한 페이지별 처리를 위한 옵션 설정
    const options = {
      // 페이지별 텍스트 추출을 위한 렌더 콜백 함수
      pagerender: async (pageData) => {
        try {
          const physicalPageNum = pageData.pageIndex + 1; // 물리적 페이지 번호 (0부터 시작하므로 +1)
          
          // 문서 내 페이지 번호 계산 (오프셋 적용)
          // 만약 physicalPageNum이 오프셋보다 작으면 앞 부분(표지, 목차 등)으로 간주
          const documentPageNum = physicalPageNum > PAGE_NUMBER_OFFSET ? 
                                  physicalPageNum - PAGE_NUMBER_OFFSET : 
                                  physicalPageNum;
          
          console.log(`페이지 처리 중: 물리적 페이지=${physicalPageNum}, 문서 내 페이지=${documentPageNum}`);
          
          // 페이지 텍스트 추출
          const textContent = await pageData.getTextContent();
          
          // 텍스트 항목을 하나의 문자열로 결합
          let pageText = "";
          textContent.items.forEach(item => {
            pageText += item.str + " ";
          });
          
          // 계층 구조 식별
          
          // 1. 암종 대분류 (예: "4 식도암(Esophageal Cancer)")
          const cancerTypePatterns = [
            /^\s*(\d+)\s+([가-힣]+암)(?:\((.*?)\))?/m,           // 4 식도암(Esophageal Cancer)
            /\d+-\d+\s+(.+?)(?:\(.*?\))?[\s\n]/,                // 7-2 담도암(Biliary Tract Cancer)
            /(\d+[\.\-]\s+.+?)\s*(?:\(.*?\))?[\s\n]/,           // 7. 폐암(Lung Cancer)
            /([가-힣]+암)[\s\n]/,                               // 직접적인 '폐암', '위암' 등의 언급
            /([가-힣]+암(?:\s*암)?)\s*(?:\(.*?\))?[\s\n]/       // 비소세포폐암(NSCLC)
          ];
          
          // 이전 계층 구조 정보 백업 (새로운 정보가 없을 때 이전 정보를 유지하기 위함)
          const prevHierarchy = { ...currentHierarchy };
          
          let cancerTypeFound = false;
          for (const pattern of cancerTypePatterns) {
            const match = pageText.match(pattern);
            if (match) {
              // 첫 번째 패턴(숫자 + 암종)인 경우
              if (match[1] && match[2]) {
                currentHierarchy.cancerType = match[2].trim();
              } 
              // 다른 패턴들
              else if (match[1]) {
                currentHierarchy.cancerType = match[1].trim();
              }
              
              if (currentHierarchy.cancerType) {
                console.log(`암종 식별됨: ${currentHierarchy.cancerType}`);
                cancerTypeFound = true;
                
                // 새로운 암종이 발견되면 하위 정보(치료방법, 투여단계)를 초기화
                // 새 암종은 새로운 계층 구조의 시작점
                if (prevHierarchy.cancerType !== currentHierarchy.cancerType) {
                  currentHierarchy.treatmentMethod = null;
                  currentHierarchy.administrationStage = null;
                }
                break;
              }
            }
          }
          
          // 추가적인 암종 키워드 검색
          if (!cancerTypeFound) {
            const cancerKeywords = ['위암', '대장암', '간암', '췌장암', '폐암', '유방암', '자궁경부암', 
              '난소암', '전립선암', '방광암', '신장암', '갑상선암', '뇌종양', '림프종', '백혈병', '골육종', '식도암'];
              
            for (const keyword of cancerKeywords) {
              if (pageText.includes(keyword)) {
                currentHierarchy.cancerType = keyword;
                console.log(`키워드 기반 암종 식별됨: ${currentHierarchy.cancerType}`);
                
                // 새로운 암종이 발견되면 하위 정보 초기화
                if (prevHierarchy.cancerType !== currentHierarchy.cancerType) {
                  currentHierarchy.treatmentMethod = null;
                  currentHierarchy.administrationStage = null;
                }
                break;
              }
            }
          }
          
          // 2. 치료 방법 중분류 (예: "1. 선행화학요법(neoadjuvant)" "2. 고식적요법(palliative)")
          const treatmentMethodPatterns = [
            /^\s*(\d+)\.\s+([가-힣]+요법)(?:\((.*?)\))?/m,          // 1. 선행화학요법(neoadjuvant)
            /(\d+)\.\s+([^(]+)(?:\(.*?\))?[\s\n]/,                  // 2. 고식적요법(palliative)
            /([가-힣]+요법)(?:\(.*?\))?[\s\n]/,                     // 보조요법(adjuvant)
            /치료(?:방)?법[^\n]*?[:：]\s*([^\n]+)/,                  // 치료법: 수술적 절제
            /(?:치료|요법)(?:의)?\s*종류[^\n]*?[:：]\s*([^\n]+)/     // 치료의 종류: 항암화학요법
          ];
          
          let treatmentMethodFound = false;
          for (const pattern of treatmentMethodPatterns) {
            const match = pageText.match(pattern);
            if (match) {
              // 특정 패턴에 따라 다른 위치에서 치료법 추출
              if (match[2]) {
                currentHierarchy.treatmentMethod = match[2].trim();
              } else if (match[1]) {
                currentHierarchy.treatmentMethod = match[1].trim();
              }
              
              if (currentHierarchy.treatmentMethod) {
                console.log(`치료 방법 식별됨: ${currentHierarchy.treatmentMethod}`);
                treatmentMethodFound = true;
                
                // 새로운 치료방법이 발견되면 하위 정보(투여단계)를 초기화
                if (prevHierarchy.treatmentMethod !== currentHierarchy.treatmentMethod) {
                  currentHierarchy.administrationStage = null;
                }
                break;
              }
            }
          }
          
          // 치료 방법 키워드 검색
          if (!treatmentMethodFound) {
            const treatmentKeywords = [
              '수술후보조요법', '수술 후 보조요법', '보조요법', '고식적요법', '선행화학요법',
              '항암화학요법', '방사선요법', '표적치료', '면역치료', '호르몬요법'
            ];
            
            for (const keyword of treatmentKeywords) {
              if (pageText.includes(keyword)) {
                currentHierarchy.treatmentMethod = keyword;
                console.log(`키워드 기반 치료방법 식별됨: ${currentHierarchy.treatmentMethod}`);
                
                // 새로운 치료방법이 발견되면 하위 정보 초기화
                if (prevHierarchy.treatmentMethod !== currentHierarchy.treatmentMethod) {
                  currentHierarchy.administrationStage = null;
                }
                break;
              }
            }
          }
          
          // 3. 투여 단계 소분류 (예: "가. 투여단계: 1차", "다. 투여단계: 2차(second-line)")
          const administrationStagePatterns = [
            /([가-힣])\.\s+투여단계:\s+(\d+차(?:.*?))(?:\(.*?\))?[\s\n]/,  // 다. 투여단계: 2차(second-line)
            /([가-힣])\.\s+투여단계:\s+(\d+차.*?)[\s\n]/,                 // 가. 투여단계: 1차
            /([가-힣])\.\s+([^:]+):\s+(.+?)[\s\n]/,                      // 가. 투여단계: 1차 이상
            /투여(?:단계|라인)[^\n]*?[:：]\s*([^\n]+)/,                   // 투여단계: 1차 이상
            /([^:]+(?:차|라인|단계)[^:]*?)[:：]\s*([^\n]+)/,              // 1차 항암치료: FOLFIRINOX
            /(\d+(?:차|라인))[\s\n]/                                     // 단순히 '2차', '1차 항암' 등의 언급
          ];
          
          let stageFound = false;
          for (const pattern of administrationStagePatterns) {
            const match = pageText.match(pattern);
            if (match) {
              if (match[1] && match[2] && match[3]) {
                // 세 그룹이 있는 패턴 - 가. 투여단계: 1차 이상
                currentHierarchy.administrationStage = `${match[2].trim()}: ${match[3].trim()}`;
                stageFound = true;
              } else if (match[1] && match[2]) {
                if (match[1].match(/[가-힣]/) && match[2].includes("차")) {
                  // "다. 투여단계: 2차(second-line)" 형태
                  currentHierarchy.administrationStage = `투여단계: ${match[2].trim()}`;
                  stageFound = true;
                } else if (match[1].match(/[가-힣]/) && match[2].includes("투여")) {
                  // 가. 투여단계: 1차 이상 형태
                  currentHierarchy.administrationStage = `${match[2].trim()}: ${match[3] ? match[3].trim() : ''}`;
                  stageFound = true;
                } else {
                  // 1차 항암치료: FOLFIRINOX 형태
                  currentHierarchy.administrationStage = match[1].trim();
                  stageFound = true;
                }
              } else if (match[1]) {
                // 마지막 패턴
                currentHierarchy.administrationStage = match[1].trim();
                stageFound = true;
              }
              
              if (stageFound) {
                console.log(`투여 단계 식별됨: ${currentHierarchy.administrationStage}`);
                break;
              }
            }
          }
          
          // 한글 문자(가,나,다,라...) + "." + "투여단계"의 패턴을 직접 찾는 방식 추가
          if (!stageFound) {
            // "다. 투여단계: 2차(second-line)" 또는 "라. 투여단계: 3차 이상" 패턴
            const koreanCharPattern = /([가나다라마바사아자차카타파하])\.\s*투여\s*단계\s*:\s*(.*?)(?:[\s\n]|$)/;
            const match = pageText.match(koreanCharPattern);
            if (match && match[1] && match[2]) {
              currentHierarchy.administrationStage = `투여단계: ${match[2].trim()}`;
              console.log(`한글문자 패턴 기반 투여단계 식별됨: ${currentHierarchy.administrationStage}`);
              stageFound = true;
            }
          }
          
          // "투여단계: 2차"와 같은 직접적인 패턴 검색
          if (!stageFound) {
            const directStagePattern = /투여\s*단계\s*:\s*(.*?)(?:[\s\n]|$)/;
            const match = pageText.match(directStagePattern);
            if (match && match[1]) {
              currentHierarchy.administrationStage = `투여단계: ${match[1].trim()}`;
              console.log(`직접 패턴 기반 투여단계 식별됨: ${currentHierarchy.administrationStage}`);
              stageFound = true;
            }
          }
          
          // 투여단계 키워드 검색
          if (!stageFound && pageText.includes("차")) {
            const lineRegex = /(\d+)\s*차/;
            const match = pageText.match(lineRegex);
            if (match) {
              currentHierarchy.administrationStage = `${match[1]}차`;
              console.log(`키워드 기반 투여단계 식별됨: ${currentHierarchy.administrationStage}`);
            }
          }
          
          // 해당 페이지 추가 - 페이지 번호와 계층 구조 정보를 모두 저장
          // 정보가 없으면 이전 페이지의 정보를 유지하도록 함
          // 변경사항이 없다면 이전 값 사용
          if (!currentHierarchy.cancerType) currentHierarchy.cancerType = prevHierarchy.cancerType;
          if (!currentHierarchy.treatmentMethod) currentHierarchy.treatmentMethod = prevHierarchy.treatmentMethod;
          if (!currentHierarchy.administrationStage) currentHierarchy.administrationStage = prevHierarchy.administrationStage;
          
          pageTexts.push({
            page: physicalPageNum,               // 물리적 페이지 번호
            documentPage: documentPageNum,       // 문서 내 페이지 번호
            text: pageText.trim(),
            hierarchy: { ...currentHierarchy }   // 현재 식별된 계층 구조 정보 복사
          });
          
          console.log(`페이지 ${physicalPageNum} 텍스트 추출 완료 (${pageText.length} 글자)`);
          return pageText;
        } catch (error) {
          console.error(`페이지 ${pageData.pageIndex + 1} 처리 오류:`, error);
          return "";
        }
      }
    };
    
    // 향상된 옵션으로 PDF 파싱 실행
    const data = await pdfParse(dataBuffer, options);
    console.log(`PDF 파싱 완료. 총 ${data.numpages}페이지, 추출된 페이지: ${pageTexts.length}페이지`);
    
    // 페이지 텍스트가 없는 경우를 위한 안전장치
    if (pageTexts.length === 0) {
      console.warn('페이지별 텍스트 추출 실패, 대체 방법으로 재시도합니다.');
      
      // 대체 방법: 전체 텍스트를 균등하게 분할
      const totalText = data.text;
      const avgCharsPerPage = Math.ceil(totalText.length / data.numpages);
      
      // 전체 텍스트에서 계층 구조 정보 추출 시도
      let currentHierarchy = {
        cancerType: null,
        treatmentMethod: null,
        administrationStage: null
      };
      
      for (let i = 1; i <= data.numpages; i++) {
        const startIdx = (i - 1) * avgCharsPerPage;
        const endIdx = Math.min(startIdx + avgCharsPerPage, totalText.length);
        const pageText = totalText.slice(startIdx, endIdx);
        
        // 문서 내 페이지 번호 계산 (오프셋 적용)
        const documentPageNum = i > PAGE_NUMBER_OFFSET ? i - PAGE_NUMBER_OFFSET : i;
        
        // 이전 계층 구조 정보 백업 (새로운 정보가 없을 때 이전 정보를 유지하기 위함)
        const prevHierarchy = { ...currentHierarchy };
        
        // 계층 구조 식별 시도 - 암종 대분류
        const cancerTypePatterns = [
          /^\s*(\d+)\s+([가-힣]+암)(?:\((.*?)\))?/m,           // 4 식도암(Esophageal Cancer)
          /\d+-\d+\s+(.+?)(?:\(.*?\))?[\s\n]/,                // 7-2 담도암(Biliary Tract Cancer)
          /(\d+[\.\-]\s+.+?)\s*(?:\(.*?\))?[\s\n]/,           // 7. 폐암(Lung Cancer)
          /([가-힣]+암)[\s\n]/,                               // 직접적인 '폐암', '위암' 등의 언급
          /([가-힣]+암(?:\s*암)?)\s*(?:\(.*?\))?[\s\n]/       // 비소세포폐암(NSCLC)
        ];
        
        let cancerTypeFound = false;
        for (const pattern of cancerTypePatterns) {
          const match = pageText.match(pattern);
          if (match) {
            // 첫 번째 패턴(숫자 + 암종)인 경우
            if (match[1] && match[2]) {
              currentHierarchy.cancerType = match[2].trim();
            } 
            // 다른 패턴들
            else if (match[1]) {
              currentHierarchy.cancerType = match[1].trim();
            }
            
            if (currentHierarchy.cancerType) {
              cancerTypeFound = true;
              
              // 새로운 암종이 발견되면 하위 정보 초기화
              if (prevHierarchy.cancerType !== currentHierarchy.cancerType) {
                currentHierarchy.treatmentMethod = null;
                currentHierarchy.administrationStage = null;
              }
              break;
            }
          }
        }
        
        // 암종 키워드 검색
        if (!cancerTypeFound) {
          const cancerKeywords = ['위암', '대장암', '간암', '췌장암', '폐암', '유방암', '자궁경부암', 
            '난소암', '전립선암', '방광암', '신장암', '갑상선암', '뇌종양', '림프종', '백혈병', '골육종', '식도암'];
            
          for (const keyword of cancerKeywords) {
            if (pageText.includes(keyword)) {
              currentHierarchy.cancerType = keyword;
              
              // 새로운 암종이 발견되면 하위 정보 초기화
              if (prevHierarchy.cancerType !== currentHierarchy.cancerType) {
                currentHierarchy.treatmentMethod = null;
                currentHierarchy.administrationStage = null;
              }
              break;
            }
          }
        }
        
        // 치료 방법 중분류
        const treatmentMethodPatterns = [
          /^\s*(\d+)\.\s+([가-힣]+요법)(?:\((.*?)\))?/m,          // 1. 선행화학요법(neoadjuvant)
          /(\d+)\.\s+([^(]+)(?:\(.*?\))?[\s\n]/,                  // 2. 고식적요법(palliative)
          /([가-힣]+요법)(?:\(.*?\))?[\s\n]/,                     // 보조요법(adjuvant)
          /치료(?:방)?법[^\n]*?[:：]\s*([^\n]+)/,                  // 치료법: 수술적 절제
          /(?:치료|요법)(?:의)?\s*종류[^\n]*?[:：]\s*([^\n]+)/     // 치료의 종류: 항암화학요법
        ];
        
        let treatmentMethodFound = false;
        for (const pattern of treatmentMethodPatterns) {
          const match = pageText.match(pattern);
          if (match) {
            // 특정 패턴에 따라 다른 위치에서 치료법 추출
            if (match[2]) {
              currentHierarchy.treatmentMethod = match[2].trim();
            } else if (match[1]) {
              currentHierarchy.treatmentMethod = match[1].trim();
            }
            
            if (currentHierarchy.treatmentMethod) {
              treatmentMethodFound = true;
              
              // 새로운 치료방법이 발견되면 하위 정보 초기화
              if (prevHierarchy.treatmentMethod !== currentHierarchy.treatmentMethod) {
                currentHierarchy.administrationStage = null;
              }
              break;
            }
          }
        }
        
        // 치료 방법 키워드 검색
        if (!treatmentMethodFound) {
          const treatmentKeywords = [
            '수술후보조요법', '수술 후 보조요법', '보조요법', '고식적요법', '선행화학요법',
            '항암화학요법', '방사선요법', '표적치료', '면역치료', '호르몬요법'
          ];
          
          for (const keyword of treatmentKeywords) {
            if (pageText.includes(keyword)) {
              currentHierarchy.treatmentMethod = keyword;
              
              // 새로운 치료방법이 발견되면 하위 정보 초기화
              if (prevHierarchy.treatmentMethod !== currentHierarchy.treatmentMethod) {
                currentHierarchy.administrationStage = null;
              }
              break;
            }
          }
        }
        
        // 투여 단계 소분류
        const administrationStagePatterns = [
          /([가-힣])\.\s+투여단계:\s+(\d+차(?:.*?))(?:\(.*?\))?[\s\n]/,  // 다. 투여단계: 2차(second-line)
          /([가-힣])\.\s+투여단계:\s+(\d+차.*?)[\s\n]/,                 // 가. 투여단계: 1차
          /([가-힣])\.\s+([^:]+):\s+(.+?)[\s\n]/,                      // 가. 투여단계: 1차 이상
          /투여(?:단계|라인)[^\n]*?[:：]\s*([^\n]+)/,                   // 투여단계: 1차 이상
          /([^:]+(?:차|라인|단계)[^:]*?)[:：]\s*([^\n]+)/,              // 1차 항암치료: FOLFIRINOX
          /(\d+(?:차|라인))[\s\n]/                                     // 단순히 '2차', '1차 항암' 등의 언급
        ];
        
        let stageFound = false;
        for (const pattern of administrationStagePatterns) {
          const match = pageText.match(pattern);
          if (match) {
            if (match[1] && match[2] && match[3]) {
              // 세 그룹이 있는 패턴 - 가. 투여단계: 1차 이상
              currentHierarchy.administrationStage = `${match[2].trim()}: ${match[3].trim()}`;
              stageFound = true;
            } else if (match[1] && match[2]) {
              if (match[1].match(/[가-힣]/) && match[2].includes("차")) {
                // "다. 투여단계: 2차(second-line)" 형태
                currentHierarchy.administrationStage = `투여단계: ${match[2].trim()}`;
                stageFound = true;
              } else if (match[1].match(/[가-힣]/) && match[2].includes("투여")) {
                // 가. 투여단계: 1차 이상 형태
                currentHierarchy.administrationStage = `${match[2].trim()}: ${match[3] ? match[3].trim() : ''}`;
                stageFound = true;
              } else {
                // 1차 항암치료: FOLFIRINOX 형태
                currentHierarchy.administrationStage = match[1].trim();
                stageFound = true;
              }
            } else if (match[1]) {
              // 마지막 패턴
              currentHierarchy.administrationStage = match[1].trim();
              stageFound = true;
            }
          }
        }
        
        // 한글 문자(가,나,다,라...) + "." + "투여단계"의 패턴을 직접 찾는 방식 추가
        if (!stageFound) {
          // "다. 투여단계: 2차(second-line)" 또는 "라. 투여단계: 3차 이상" 패턴
          const koreanCharPattern = /([가나다라마바사아자차카타파하])\.\s*투여\s*단계\s*:\s*(.*?)(?:[\s\n]|$)/;
          const match = pageText.match(koreanCharPattern);
          if (match && match[1] && match[2]) {
            currentHierarchy.administrationStage = `투여단계: ${match[2].trim()}`;
            stageFound = true;
          }
        }
        
        // "투여단계: 2차"와 같은 직접적인 패턴 검색
        if (!stageFound) {
          const directStagePattern = /투여\s*단계\s*:\s*(.*?)(?:[\s\n]|$)/;
          const match = pageText.match(directStagePattern);
          if (match && match[1]) {
            currentHierarchy.administrationStage = `투여단계: ${match[1].trim()}`;
            stageFound = true;
          }
        }
        
        // 투여단계 키워드 검색
        if (!stageFound && pageText.includes("차")) {
          const lineRegex = /(\d+)\s*차/;
          const match = pageText.match(lineRegex);
          if (match) {
            currentHierarchy.administrationStage = `${match[1]}차`;
          }
        }
        
        // 변경사항이 없다면 이전 값 사용
        if (!currentHierarchy.cancerType) currentHierarchy.cancerType = prevHierarchy.cancerType;
        if (!currentHierarchy.treatmentMethod) currentHierarchy.treatmentMethod = prevHierarchy.treatmentMethod;
        if (!currentHierarchy.administrationStage) currentHierarchy.administrationStage = prevHierarchy.administrationStage;
        
        pageTexts.push({
          page: i,                     // 물리적 페이지 번호
          documentPage: documentPageNum, // 문서 내 페이지 번호
          text: pageText,
          hierarchy: { ...currentHierarchy } // 현재 식별된 계층 구조 정보 복사
        });
        
        console.log(`페이지 ${i} 대체 방법으로 처리 완료 (${endIdx - startIdx} 글자)`);
      }
    }
    
    console.log(`PDF 텍스트 추출 완료. 총 ${pageTexts.length}개 페이지 처리됨`);
    return pageTexts;
  } catch (error) {
    console.error('PDF 텍스트 추출 오류:', error);
    throw new Error(`PDF 텍스트 추출 실패: ${error.message}`);
  }
}

/**
 * 페이지별 텍스트를 청크로 분할하는 함수 (페이지 정보 유지)
 */
async function splitTextIntoChunks(pageTexts) {
  try {
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200
    });
    
    // 각 페이지의 텍스트를 청크로 분할하고, 페이지 정보 유지
    const chunksWithPageInfo = [];
    
    for (const { page, documentPage, text, hierarchy } of pageTexts) {
      // 현재 페이지의 텍스트를 청크로 분할
      const chunks = await splitter.splitText(text);
      
      // 각 청크에 페이지 정보 추가
      chunks.forEach(chunk => {
        chunksWithPageInfo.push({
          text: chunk,
          page: page,                  // 물리적 페이지 번호
          documentPage: documentPage,  // 문서 내 페이지 번호
          hierarchy: hierarchy         // 계층 구조 정보
        });
      });
    }
    
    console.log(`총 ${chunksWithPageInfo.length}개의 청크로 분할되었습니다.`);
    return chunksWithPageInfo;
  } catch (error) {
    console.error('텍스트 분할 오류:', error);
    throw new Error(`텍스트 분할 실패: ${error.message}`);
  }
}

/**
 * 청크를 문서 형식으로 변환하는 함수 (페이지 정보 포함)
 */
function createDocumentsFromChunks(chunksWithPageInfo, metadata = {}) {
  console.log('청크를 문서로 변환 중...');
  
  return chunksWithPageInfo.map((chunk, index) => {
    // 페이지 번호 확인 및 디버깅
    const physicalPageNum = chunk.page;
    const documentPageNum = chunk.documentPage;
    const hierarchy = chunk.hierarchy || {};
    
    console.log(`청크 ${index}: 물리적 페이지=${physicalPageNum}, 문서 내 페이지=${documentPageNum}, 텍스트 길이 ${chunk.text.length}`);
    
    if (hierarchy.cancerType) {
      console.log(`  - 암종: ${hierarchy.cancerType}`);
    }
    if (hierarchy.treatmentMethod) {
      console.log(`  - 치료방법: ${hierarchy.treatmentMethod}`);
    }
    if (hierarchy.administrationStage) {
      console.log(`  - 투여단계: ${hierarchy.administrationStage}`);
    }
    
    return new Document({
      pageContent: chunk.text,
      metadata: {
        ...metadata,
        chunk_id: `chunk_${index}`,
        source: metadata.source || 'unknown',
        index: index,
        page: physicalPageNum,              // 물리적 페이지 번호
        documentPage: documentPageNum,      // 문서 내 페이지 번호
        cancerType: hierarchy.cancerType,   // 암종 정보
        treatmentMethod: hierarchy.treatmentMethod, // 치료 방법
        administrationStage: hierarchy.administrationStage // 투여 단계
      }
    });
  });
}

/**
 * 문서를 벡터 저장소에 저장하는 함수
 */
async function storeDocumentsInVectorDB(documents, namespace = NAMESPACE) {
  try {
    // 저장 경로 설정
    const storeDir = path.join(VECTOR_STORE_DIR, namespace);
    ensureDirectoryExists(storeDir);
    
    // 문서가 이미 존재하는지 확인
    let vectorStore;
    if (fs.existsSync(path.join(storeDir, 'faiss.index'))) {
      // 새 네임스페이스가 아니면 기존 인덱스 삭제 후 새로 생성
      console.log('기존 벡터 저장소를 삭제하고 새로 생성합니다...');
      fs.unlinkSync(path.join(storeDir, 'faiss.index'));
      fs.unlinkSync(path.join(storeDir, 'docstore.json'));
      vectorStore = await FaissStore.fromDocuments(documents, embeddings);
    } else {
      // 새 인덱스 생성
      console.log('새 벡터 저장소를 생성합니다...');
      vectorStore = await FaissStore.fromDocuments(documents, embeddings);
    }
    
    // 벡터 저장소 저장
    await vectorStore.save(storeDir);
    
    console.log(`${documents.length}개 문서를 벡터 DB에 저장했습니다. 경로: ${storeDir}`);
    return true;
  } catch (error) {
    console.error('벡터 DB 저장 오류:', error);
    throw new Error(`벡터 DB 저장 실패: ${error.message}`);
  }
}

/**
 * PDF 파일을 처리하고 벡터화하여 저장하는 함수
 */
async function processPDF(pdfPath, metadata = {}) {
  try {
    console.log(`PDF 파일 처리 중: ${pdfPath}`);
    
    // PDF에서 페이지별 텍스트 추출
    const pageTexts = await extractTextFromPDF(pdfPath);
    console.log(`추출된 페이지 수: ${pageTexts.length}`);
    
    // 텍스트를 청크로 분할 (페이지 정보 유지)
    const chunksWithPageInfo = await splitTextIntoChunks(pageTexts);
    console.log(`생성된 청크 수: ${chunksWithPageInfo.length}`);
    
    // 메타데이터 준비
    const fileMetadata = {
      source: path.basename(pdfPath),
      title: metadata.title || path.basename(pdfPath, '.pdf'),
      author: metadata.author || 'unknown',
      date: metadata.date || new Date().toISOString(),
      category: metadata.category || 'cancer-treatment',
      filePath: pdfPath,
      ...metadata
    };
    
    // 청크를 문서로 변환 (페이지 정보 포함)
    const documents = createDocumentsFromChunks(chunksWithPageInfo, fileMetadata);
    
    // 벡터 DB에 저장
    await storeDocumentsInVectorDB(documents, metadata.namespace || NAMESPACE);
    
    return {
      success: true,
      documentCount: documents.length,
      message: `PDF 파일 '${path.basename(pdfPath)}'가 성공적으로 처리되었습니다.`,
      pageCount: pageTexts.length
    };
  } catch (error) {
    console.error('PDF 처리 오류:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * 벡터 DB에서 유사한 문서를 검색하는 함수
 */
async function searchSimilarDocuments(query, namespace = NAMESPACE, topK = 5) {
  try {
    console.log(`검색 쿼리: "${query}"`);
    
    // 저장 경로 설정
    const storeDir = path.join(VECTOR_STORE_DIR, namespace);
    
    // 벡터 스토어가 존재하는지 확인
    if (!fs.existsSync(path.join(storeDir, 'faiss.index'))) {
      throw new Error(`벡터 DB가 존재하지 않습니다: ${storeDir}`);
    }
    
    // 벡터 스토어 로드
    const vectorStore = await FaissStore.load(storeDir, embeddings);
    
    // 유사한 문서 검색
    const results = await vectorStore.similaritySearch(query, topK);
    
    console.log(`검색 결과: ${results.length}개 문서 발견`);
    return results;
  } catch (error) {
    console.error('문서 검색 오류:', error);
    throw new Error(`문서 검색 실패: ${error.message}`);
  }
}

/**
 * 저장된 모든 네임스페이스 목록을 가져오는 함수
 */
function getAvailableNamespaces() {
  try {
    if (!fs.existsSync(VECTOR_STORE_DIR)) {
      return [];
    }
    
    return fs.readdirSync(VECTOR_STORE_DIR)
      .filter(dir => fs.statSync(path.join(VECTOR_STORE_DIR, dir)).isDirectory())
      .filter(dir => fs.existsSync(path.join(VECTOR_STORE_DIR, dir, 'faiss.index')));
  } catch (error) {
    console.error('네임스페이스 조회 오류:', error);
    return [];
  }
}

/**
 * 네임스페이스의 총 페이지 수를 가져오는 함수
 */
function getNamespacePageCount(namespace = NAMESPACE) {
  try {
    const storeDir = path.join(VECTOR_STORE_DIR, namespace);
    if (!fs.existsSync(path.join(storeDir, 'docstore.json'))) {
      return 0;
    }
    
    // docstore.json 파일 읽기
    const docstoreData = JSON.parse(fs.readFileSync(path.join(storeDir, 'docstore.json'), 'utf8'));
    
    // 모든 문서의 메타데이터에서 페이지 번호 추출
    const pages = new Set();
    for (const key in docstoreData) {
      if (docstoreData[key]?.metadata?.page) {
        pages.add(docstoreData[key].metadata.page);
      }
    }
    
    return pages.size;
  } catch (error) {
    console.error('페이지 수 조회 오류:', error);
    return 0;
  }
}

module.exports = {
  processPDF,
  searchSimilarDocuments,
  extractTextFromPDF,
  getAvailableNamespaces,
  getNamespacePageCount,
  VECTOR_STORE_DIR,
  NAMESPACE
}; 
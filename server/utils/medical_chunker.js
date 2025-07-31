import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';

class MedicalChunker {
  constructor() {
    // 의료 특화 청킹 설정
    this.medicalSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1500, // 청크 크기 증가
      chunkOverlap: 300, // 오버랩 증가
      separators: [
        '\n\n## ', // 섹션 구분
        '\n\n### ', // 하위 섹션 구분
        '\n\n', // 단락 구분
        '\n', // 줄 구분
        '. ', // 문장 구분
        ' ', // 단어 구분
      ]
    });
  }

  // 의료 문서 특화 청킹
  async chunkMedicalDocument(text, sourceInfo) {
    console.log('의료 문서 청킹 시작...');
    
    // 1. 전처리: 의료 용어 정규화
    const normalizedText = this.normalizeMedicalTerms(text);
    
    // 2. 섹션별 분리
    const sections = this.extractSections(normalizedText);
    
    // 3. 각 섹션을 청킹
    const chunks = [];
    let chunkIndex = 0;
    
    for (const [sectionName, sectionContent] of Object.entries(sections)) {
      if (sectionContent.trim().length < 50) continue; // 너무 짧은 섹션 제외
      
      const sectionChunks = await this.medicalSplitter.splitText(sectionContent);
      
      for (const chunk of sectionChunks) {
        chunks.push({
          pageContent: chunk,
          metadata: {
            ...sourceInfo,
            chunkIndex: chunkIndex++,
            section: sectionName,
            totalChunks: sectionChunks.length,
            chunkType: 'medical_section'
          }
        });
      }
    }
    
    console.log(`의료 문서 청킹 완료: ${chunks.length}개 청크 생성`);
    return chunks;
  }

  // 의료 용어 정규화
  normalizeMedicalTerms(text) {
    // 약물명 정규화
    const drugMappings = {
      // 면역항암제
      '펨브롤리주맙': 'pembrolizumab',
      '키트루다': 'Keytruda',
      '니볼루맙': 'nivolumab',
      '옵디보': 'Opdivo',
      '아테졸리주맙': 'atezolizumab',
      '테센트릭': 'Tecentriq',
      '듀발루맙': 'durvalumab',
      '이미피니': 'Imfinzi',
      
      // 항진균제
      '암포테리신B': 'amphotericin B',
      '암비솜': 'AmBisome',
      '보리코나졸': 'voriconazole',
      '포사코나졸': 'posaconazole',
      
      // 항바이러스제
      '간시클로비르': 'ganciclovir',
      'GCV': 'ganciclovir',
      '마리바비르': 'maribavir',
      
      // 기타 의료 용어
      '급여기준': '급여기준',
      '허가기준': '허가기준',
      '고시기준': '고시기준',
      '적응증': '적응증',
      '사례별심사': '사례별심사',
      '삭감': '삭감',
      '비급여': '비급여',
      '급여': '급여',
      '임의비급여': '임의비급여'
    };

    let normalized = text;
    for (const [korean, english] of Object.entries(drugMappings)) {
      normalized = normalized.replace(new RegExp(korean, 'g'), `${korean}(${english})`);
    }

    return normalized;
  }

  // 섹션별 추출
  extractSections(text) {
    const sections = {
      '급여기준': '',
      '적응증': '',
      '용량': '',
      '투여방법': '',
      '주의사항': '',
      '부작용': '',
      '상호작용': '',
      '기타': ''
    };

    // 급여기준 섹션 추출
    const reimbursementMatch = text.match(/(급여기준|보험급여|급여인정|급여기준인정)[\s\S]*?(?=\n\n|\n### |$)/i);
    if (reimbursementMatch) {
      sections['급여기준'] = reimbursementMatch[0];
    }

    // 적응증 섹션 추출
    const indicationMatch = text.match(/(적응증|적응질환|치료대상)[\s\S]*?(?=\n\n|\n### |$)/i);
    if (indicationMatch) {
      sections['적응증'] = indicationMatch[0];
    }

    // 용량 섹션 추출
    const dosageMatch = text.match(/(용량|투여량|용법용량)[\s\S]*?(?=\n\n|\n### |$)/i);
    if (dosageMatch) {
      sections['용량'] = dosageMatch[0];
    }

    // 투여방법 섹션 추출
    const administrationMatch = text.match(/(투여방법|투여경로|주사방법)[\s\S]*?(?=\n\n|\n### |$)/i);
    if (administrationMatch) {
      sections['투여방법'] = administrationMatch[0];
    }

    // 주의사항 섹션 추출
    const warningMatch = text.match(/(주의사항|주의|경고)[\s\S]*?(?=\n\n|\n### |$)/i);
    if (warningMatch) {
      sections['주의사항'] = warningMatch[0];
    }

    // 부작용 섹션 추출
    const sideEffectMatch = text.match(/(부작용|부정반응|이상반응)[\s\S]*?(?=\n\n|\n### |$)/i);
    if (sideEffectMatch) {
      sections['부작용'] = sideEffectMatch[0];
    }

    // 상호작용 섹션 추출
    const interactionMatch = text.match(/(상호작용|약물상호작용|약물간상호작용)[\s\S]*?(?=\n\n|\n### |$)/i);
    if (interactionMatch) {
      sections['상호작용'] = interactionMatch[0];
    }

    // 나머지 내용을 기타로 분류
    const usedSections = Object.values(sections).filter(s => s.length > 0);
    const remainingText = text.replace(new RegExp(usedSections.join('|'), 'g'), '');
    if (remainingText.trim().length > 100) {
      sections['기타'] = remainingText.trim();
    }

    return sections;
  }

  // 엔티티 추출 (약물명, 질병명, 증상 등)
  extractMedicalEntities(text) {
    const entities = {
      drugs: [],
      diseases: [],
      symptoms: [],
      procedures: []
    };

    // 약물명 패턴
    const drugPatterns = [
      /([가-힣]+주맙|키트루다|옵디보|테센트릭|이미피니)/g,
      /([A-Z][a-z]+umab|mab$)/g
    ];

    // 질병명 패턴
    const diseasePatterns = [
      /([가-힣]+암|폐암|유방암|대장암|위암|간암|췌장암|전립선암|난소암)/g,
      /([가-힣]+증후군|증후군)/g
    ];

    // 증상 패턴
    const symptomPatterns = [
      /(발열|오한|구역|구토|설사|변비|피로|통증|부종|발진)/g
    ];

    // 시술 패턴
    const procedurePatterns = [
      /(수술|절제술|절개술|화학요법|방사선치료|면역치료|항암치료)/g
    ];

    // 엔티티 추출
    drugPatterns.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) {
        entities.drugs.push(...matches);
      }
    });

    diseasePatterns.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) {
        entities.diseases.push(...matches);
      }
    });

    symptomPatterns.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) {
        entities.symptoms.push(...matches);
      }
    });

    procedurePatterns.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) {
        entities.procedures.push(...matches);
      }
    });

    // 중복 제거
    Object.keys(entities).forEach(key => {
      entities[key] = [...new Set(entities[key])];
    });

    return entities;
  }
}

export default MedicalChunker; 
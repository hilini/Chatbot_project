import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class MedicalCriteriaAnalyzer {
  constructor() {
    this.criteriaDatabase = this.loadCriteriaDatabase();
    this.medicalTerms = this.loadMedicalTerms();
  }

  // 의료 용어 사전 로드
  loadMedicalTerms() {
    return {
      // 암종별 동의어
      'B-ALL': ['급성림프모구백혈병', 'acute lymphoblastic leukemia', 'ALL'],
      'Ph(+)': ['필라델피아염색체', 'Philadelphia chromosome', 'BCR-ABL'],
      'MRD': ['최소잔존질환', 'minimal residual disease'],
      'blinatumomab': ['블리나투모맙'],
      
      // 치료 단계
      'induction': ['유도요법', '관해유도요법'],
      'CR': ['완전관해', 'complete remission'],
      'consolidation': ['공고요법', '관해공고요법'],
      
      // 급여 구분
      '급여': ['보험급여', '건강보험급여'],
      '비급여': ['자가부담', '전액본인부담'],
      '일의비급여': ['일부본인부담', '5%본인부담'],
      '허가초과용도': ['허가외사용', 'off-label use']
    };
  }

  // 기준 데이터베이스 로드
  loadCriteriaDatabase() {
    const metadataPath = path.join(__dirname, '../data/vector/metadata.json');
    
    if (fs.existsSync(metadataPath)) {
      try {
        const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
        return this.structureCriteriaData(metadata);
      } catch (error) {
        console.error('기준 데이터베이스 로드 실패:', error);
        return {};
      }
    }
    return {};
  }

  // 메타데이터를 구조화된 기준으로 변환
  structureCriteriaData(metadata) {
    const structuredCriteria = {
      indication_criteria: {}, // 식약처 허가사항
      reimbursement_policy: {}, // HIRA 급여기준
      treatment_protocols: {} // 치료 프로토콜
    };

    // 파일별로 데이터 구조화
    Object.values(metadata.files).forEach(file => {
      if (file.textContent && file.textContent.includes('허가초과')) {
        this.parseOffLabelData(file.textContent, structuredCriteria);
      }
    });

    return structuredCriteria;
  }

  // 허가초과 데이터 파싱
  parseOffLabelData(content, structuredCriteria) {
    const lines = content.split('\n');
    let currentProtocol = null;

    lines.forEach(line => {
      // 요법코드 패턴 매칭
      const protocolMatch = line.match(/(\d{4})\s+([^\t]+)\s+([^\t]+)\s+([^\t]+)/);
      if (protocolMatch) {
        const [, code, cancerType, treatment, target] = protocolMatch;
        currentProtocol = {
          code,
          cancerType: cancerType.trim(),
          treatment: treatment.trim(),
          target: target.trim(),
          criteria: {
            indication_criteria: {
              주관: "식약처",
              조건: target.trim(),
              급여: "X",
              비급여: "O",
              일의비급여: "X",
              허가초과용도: "O"
            },
            reimbursement_policy: {
              주관: "건강보험심사평가원(HIRA)",
              조건: target.trim(),
              급여: "O",
              비급여: "X",
              일의비급여: "X",
              허가초과용도: "O"
            }
          }
        };
        
        structuredCriteria.treatment_protocols[code] = currentProtocol;
      }
    });
  }

  // 사용자 질문 분석
  analyzeQuery(query) {
    const analysis = {
      extractedInfo: this.extractMedicalInfo(query),
      relevantCriteria: [],
      decisionFactors: []
    };

    // 관련 기준 검색
    analysis.relevantCriteria = this.searchRelevantCriteria(query);
    
    // 판단 요소 추출
    analysis.decisionFactors = this.extractDecisionFactors(query, analysis.relevantCriteria);

    return analysis;
  }

  // 의료 정보 추출
  extractMedicalInfo(query) {
    const extracted = {
      cancerType: null,
      treatment: null,
      patientCondition: null,
      treatmentStage: null,
      specificCriteria: []
    };

    // 암종 추출
    Object.keys(this.medicalTerms).forEach(term => {
      if (query.includes(term)) {
        extracted.cancerType = term;
      }
    });

    // 치료 단계 추출
    if (query.includes('induction') || query.includes('유도')) {
      extracted.treatmentStage = 'induction';
    }
    if (query.includes('CR') || query.includes('관해')) {
      extracted.treatmentStage = 'remission';
    }
    if (query.includes('MRD') || query.includes('잔존')) {
      extracted.treatmentStage = 'MRD_positive';
    }

    return extracted;
  }

  // 관련 기준 검색
  searchRelevantCriteria(query) {
    const relevant = [];
    
    Object.values(this.criteriaDatabase.treatment_protocols || {}).forEach(protocol => {
      let relevanceScore = 0;
      
      // 암종 매칭
      if (query.toLowerCase().includes(protocol.cancerType.toLowerCase())) {
        relevanceScore += 3;
      }
      
      // 치료제 매칭
      if (query.toLowerCase().includes(protocol.treatment.toLowerCase())) {
        relevanceScore += 2;
      }
      
      // 조건 매칭
      if (query.toLowerCase().includes(protocol.target.toLowerCase())) {
        relevanceScore += 1;
      }

      if (relevanceScore > 0) {
        relevant.push({
          ...protocol,
          relevanceScore
        });
      }
    });

    return relevant.sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  // 판단 요소 추출
  extractDecisionFactors(query, relevantCriteria) {
    const factors = [];

    relevantCriteria.forEach(criteria => {
      // 식약처 허가사항 확인
      if (criteria.criteria.indication_criteria.허가초과용도 === "O") {
        factors.push({
          type: "indication",
          status: "허가초과",
          description: "식약처 허가사항을 벗어난 사용",
          impact: "negative"
        });
      }

      // HIRA 급여기준 확인
      if (criteria.criteria.reimbursement_policy.급여 === "O") {
        factors.push({
          type: "reimbursement",
          status: "급여가능",
          description: "HIRA 급여기준 충족",
          impact: "positive"
        });
      }
    });

    return factors;
  }

  // 최종 판단 생성
  generateDecision(analysis) {
    const positiveFactors = analysis.decisionFactors.filter(f => f.impact === "positive");
    const negativeFactors = analysis.decisionFactors.filter(f => f.impact === "negative");

    let decision = "판단불가";
    let confidence = 0;

    if (positiveFactors.length > 0 && negativeFactors.length === 0) {
      decision = "급여가능";
      confidence = 0.8;
    } else if (negativeFactors.length > 0 && positiveFactors.length === 0) {
      decision = "급여불가";
      confidence = 0.8;
    } else if (positiveFactors.length > 0 && negativeFactors.length > 0) {
      decision = "조건부급여";
      confidence = 0.6;
    }

    return {
      decision,
      confidence,
      factors: analysis.decisionFactors,
      relevantCriteria: analysis.relevantCriteria,
      recommendation: this.generateRecommendation(decision, analysis.decisionFactors)
    };
  }

  // 권장사항 생성
  generateRecommendation(decision, factors) {
    switch (decision) {
      case "급여가능":
        return "해당 치료는 HIRA 급여기준을 충족하므로 급여 인정이 가능합니다.";
      case "급여불가":
        return "허가초과용도로 인해 급여 인정이 어렵습니다. 허가된 적응증 내에서 재검토가 필요합니다.";
      case "조건부급여":
        return "허가초과용도이지만 특정 조건 하에서 급여가 가능할 수 있습니다. 상세한 진료기록과 함께 심사 신청을 권장합니다.";
      default:
        return "정확한 판단을 위해 추가적인 임상 정보가 필요합니다.";
    }
  }

  // 구조화된 응답 생성
  generateStructuredResponse(query, decision) {
    return {
      query: query,
      decision: decision.decision,
      confidence: decision.confidence,
      summary: {
        급여가능: decision.factors.filter(f => f.impact === "positive").length,
        급여불가: decision.factors.filter(f => f.impact === "negative").length
      },
      details: {
        식약처허가사항: decision.factors.filter(f => f.type === "indication"),
        HIRA급여기준: decision.factors.filter(f => f.type === "reimbursement")
      },
      recommendation: decision.recommendation,
      relevantProtocols: decision.relevantCriteria.map(c => ({
        code: c.code,
        cancerType: c.cancerType,
        treatment: c.treatment,
        target: c.target
      }))
    };
  }
}

export default MedicalCriteriaAnalyzer; 
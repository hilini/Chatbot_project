#!/usr/bin/env node

/**
 * MCP Server implementation for anticancer chat
 * 
 * This file starts an MCP server that provides tools for:
 * - Treatment regimen retrieval
 * - Treatment coverage checking
 * - Clinical trial search
 */

const { Registry, Server } = require('@modelcontextprotocol/sdk/server');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio');
const path = require('path');
const z = require('zod');

// Schema definitions for tools
const CancerTypeSchema = z.string().describe('Type of cancer (e.g., lung, breast, colon)');
const StageSchema = z.string().describe('Cancer stage (e.g., I, II, III, IV)');
const BiomarkersSchema = z.array(z.string()).describe('Biomarkers (e.g., ["EGFR+", "HER2-"])');
const TreatmentNameSchema = z.string().describe('Name of the treatment or medication');
const LocationSchema = z.string().describe('Location for clinical trials (e.g., city or region)');
const PatientDetailsSchema = z.object({
  age: z.number().optional().describe('Patient age'),
  gender: z.string().optional().describe('Patient gender'),
  previousTreatments: z.array(z.string()).optional().describe('Previous treatments received')
}).optional();

// Initialize the MCP registry
const registry = new Registry();

// Register the getTreatmentRegimen tool
registry.registerTool({
  name: 'getTreatmentRegimen',
  description: 'Get recommended treatment regimens for a specific cancer type, stage, and biomarkers',
  parameters: {
    cancerType: CancerTypeSchema,
    stage: StageSchema,
    biomarkers: BiomarkersSchema.optional()
  },
  handler: async (args) => {
    console.log('getTreatmentRegimen called with:', args);
    
    // This is a simulation - in a real implementation, this would query a database
    // or other data source for actual treatment recommendations
    const { cancerType, stage, biomarkers = [] } = args;
    
    // Simulate some realistic treatment regimens based on the input
    const regimens = [];
    
    if (cancerType.toLowerCase().includes('lung')) {
      if (stage === 'IV' || stage === '4') {
        if (biomarkers.some(b => b.includes('EGFR'))) {
          regimens.push({
            name: 'Osimertinib (타그리소)',
            description: 'EGFR 변이 양성 비소세포폐암에 대한 표적치료제',
            medications: ['Osimertinib'],
            coverageStatus: '급여',
            evidenceLevel: 'A'
          });
        } else {
          regimens.push({
            name: 'Pembrolizumab + Pemetrexed + Platinum (키트루다 + 알림타 + 시스플라틴/카보플라틴)',
            description: '전이성 비편평 비소세포폐암에 대한 1차 치료',
            medications: ['Pembrolizumab', 'Pemetrexed', 'Cisplatin/Carboplatin'],
            coverageStatus: '급여',
            evidenceLevel: 'A'
          });
        }
      } else if (stage === 'III') {
        regimens.push({
          name: 'Concurrent Chemoradiation + Durvalumab',
          description: '절제 불가능한 3기 비소세포폐암에 대한 치료',
          medications: ['Cisplatin/Carboplatin', 'Etoposide', 'Radiation', 'Durvalumab'],
          coverageStatus: '급여',
          evidenceLevel: 'A'
        });
      }
    } else if (cancerType.toLowerCase().includes('breast')) {
      if (biomarkers.some(b => b.includes('HER2+'))) {
        regimens.push({
          name: 'Trastuzumab + Pertuzumab + Docetaxel + Carboplatin (허셉틴 + 퍼제타 + 도세탁셀 + 카보플라틴)',
          description: 'HER2 양성 유방암에 대한 표적치료',
          medications: ['Trastuzumab', 'Pertuzumab', 'Docetaxel', 'Carboplatin'],
          coverageStatus: '급여',
          evidenceLevel: 'A'
        });
      } else if (biomarkers.some(b => b.includes('ER+') || b.includes('PR+'))) {
        regimens.push({
          name: 'Anastrozole/Letrozole (아리미덱스/페마라)',
          description: '호르몬 수용체 양성 유방암에 대한 호르몬 치료',
          medications: ['Anastrozole/Letrozole'],
          coverageStatus: '급여',
          evidenceLevel: 'A'
        });
      } else {
        regimens.push({
          name: 'AC-T (독소루비신 + 싸이클로포스파마이드 - 탁솔)',
          description: '삼중 음성 유방암에 대한 항암화학요법',
          medications: ['Doxorubicin', 'Cyclophosphamide', 'Paclitaxel'],
          coverageStatus: '급여',
          evidenceLevel: 'A'
        });
      }
    }
    
    // If no specific regimens were found, provide a generic response
    if (regimens.length === 0) {
      regimens.push({
        name: `${cancerType} ${stage}기 표준 치료`,
        description: `${cancerType} ${stage}기에 대한 일반적인 치료 접근법`,
        medications: ['항암화학요법 및/또는 표적치료제'],
        coverageStatus: '개별 약제에 따라 다름',
        evidenceLevel: 'B'
      });
    }
    
    return {
      recommendedRegimens: regimens,
      notes: `${cancerType} ${stage}기 환자에 대한 치료 방법입니다. 실제 치료는 환자의 전체적인 상태와 의료진의 판단에 따라 달라질 수 있습니다.`
    };
  }
});

// Register the checkTreatmentCoverage tool
registry.registerTool({
  name: 'checkTreatmentCoverage',
  description: 'Check if a specific treatment is covered by Korean National Health Insurance for a given cancer type',
  parameters: {
    treatmentName: TreatmentNameSchema,
    cancerType: CancerTypeSchema,
    patientDetails: PatientDetailsSchema.optional()
  },
  handler: async (args) => {
    console.log('checkTreatmentCoverage called with:', args);
    
    const { treatmentName, cancerType } = args;
    
    // Simulate coverage information - in a real implementation, this would query
    // an actual database of coverage information
    const commonCoveredTreatments = {
      '키트루다': {
        coverageStatus: '급여',
        conditions: '비소세포폐암, 흑색종, 요로상피암 등 특정 조건에서 급여 인정',
        restrictions: 'PD-L1 발현율에 따른 제한이 있을 수 있음',
        alternativeTreatments: ['니볼루맙 (옵디보)', '아테졸리주맙 (티센트릭)']
      },
      '허셉틴': {
        coverageStatus: '급여',
        conditions: 'HER2 과발현 유방암, 위암 등에서 급여 인정',
        restrictions: 'HER2 양성 확인 필요',
        alternativeTreatments: []
      },
      '글리벡': {
        coverageStatus: '급여',
        conditions: '만성골수성백혈병, 위장관기질종양 등에서 급여 인정',
        restrictions: '특정 유전자 변이 확인 필요',
        alternativeTreatments: ['타시그나', '스프라이셀']
      }
    };
    
    // Check for coverage status
    const lowerTreatmentName = treatmentName.toLowerCase();
    let coverageInfo = null;
    
    // Check exact matches first
    for (const [treatment, info] of Object.entries(commonCoveredTreatments)) {
      if (lowerTreatmentName.includes(treatment.toLowerCase())) {
        coverageInfo = {
          treatmentName: treatment,
          ...info,
          applicableToCancerType: info.conditions.toLowerCase().includes(cancerType.toLowerCase())
        };
        break;
      }
    }
    
    // If no match, provide a generic response
    if (!coverageInfo) {
      return {
        coverageStatus: '정보 없음',
        message: `${treatmentName}에 대한 급여 정보를 찾을 수 없습니다. 건강보험심사평가원 또는 담당 의료진에게 문의하세요.`,
        suggestedActions: [
          '건강보험심사평가원 웹사이트에서 최신 급여 기준 확인',
          '병원 원무과에 문의',
          '담당 의사에게 대체 치료 옵션 문의'
        ]
      };
    }
    
    return coverageInfo;
  }
});

// Register the findClinicalTrials tool
registry.registerTool({
  name: 'findClinicalTrials',
  description: 'Find clinical trials available for a specific cancer type and location',
  parameters: {
    cancerType: CancerTypeSchema,
    location: LocationSchema,
    patientDetails: PatientDetailsSchema.optional()
  },
  handler: async (args) => {
    console.log('findClinicalTrials called with:', args);
    
    const { cancerType, location, patientDetails = {} } = args;
    
    // Simulate clinical trial data - in a real implementation, this would query
    // a database or API for actual clinical trial information
    const sampleTrials = [
      {
        id: 'KCT0001234',
        title: `${cancerType} 환자에서 면역항암제와 표적치료제의 병용요법에 대한 임상시험`,
        phase: '2상',
        location: '서울아산병원',
        status: '모집중',
        eligibility: {
          minAge: 18,
          maxAge: 75,
          cancerTypes: [cancerType],
          priorTreatments: '표준치료 실패 또는 불내약 환자'
        },
        contactInfo: {
          name: '임상시험센터',
          phone: '02-1234-5678',
          email: 'trials@amc.seoul.kr'
        }
      },
      {
        id: 'KCT0005678',
        title: `진행성 ${cancerType}에서 새로운 경구용 표적치료제의 효과 및 안전성 평가`,
        phase: '1/2상',
        location: '삼성서울병원',
        status: '모집중',
        eligibility: {
          minAge: 20,
          maxAge: 80,
          cancerTypes: [cancerType],
          priorTreatments: '최소 1개 이상의 항암치료 경험'
        },
        contactInfo: {
          name: '임상시험센터',
          phone: '02-3410-1234',
          email: 'trials@samsung.seoul.kr'
        }
      },
      {
        id: 'KCT0009012',
        title: `조기 ${cancerType} 환자에서 보조요법으로서의 면역항암제 효과 평가`,
        phase: '3상',
        location: '연세세브란스병원',
        status: '모집중',
        eligibility: {
          minAge: 19,
          maxAge: 70,
          cancerTypes: [cancerType],
          priorTreatments: '수술 후 환자'
        },
        contactInfo: {
          name: '임상시험센터',
          phone: '02-2228-1234',
          email: 'trials@yuhs.ac'
        }
      }
    ];
    
    // Filter trials by location if specific city is mentioned
    let filteredTrials = sampleTrials;
    if (location && location.toLowerCase() !== '전국') {
      filteredTrials = sampleTrials.filter(trial => 
        trial.location.toLowerCase().includes(location.toLowerCase()));
    }
    
    // Filter by age if provided
    if (patientDetails.age) {
      filteredTrials = filteredTrials.filter(trial => 
        patientDetails.age >= trial.eligibility.minAge && 
        patientDetails.age <= trial.eligibility.maxAge);
    }
    
    return {
      totalTrials: filteredTrials.length,
      trials: filteredTrials,
      disclaimer: '위 임상시험 정보는 예시이며, 실제 진행 여부와 모집 상태는 각 기관에 문의하시기 바랍니다.'
    };
  }
});

// Start the MCP server
const server = new Server(registry);
const transport = new StdioServerTransport();

console.log('Starting MCP server...');
server.listen(transport)
  .catch(error => {
    console.error('Failed to start MCP server:', error);
    process.exit(1);
  });

console.log('MCP server started'); 
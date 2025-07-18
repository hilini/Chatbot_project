/**
 * Anticancer Chat Application Configuration
 * 
 * This file contains global configuration settings for the application.
 * Edit these settings to customize the behavior of your application.
 */

module.exports = {
  // Server Settings
  server: {
    port: 3001,
    host: '0.0.0.0',
    cors: {
      origins: ['http://localhost:3000', 'http://10.10.10.103:3000'],
      methods: ['GET', 'POST'],
      credentials: true
    }
  },
  
  // AI Configuration
  ai: {
    openaiAvailable: true,  // Set to true when you want to enable OpenAI features
    openaiModel: 'gpt-4o-mini',    // Model to use when OpenAI is available
    embeddingModel: 'text-embedding-ada-002',
    retryAttempts: 3
  },
  
  // MCP Configuration
  mcp: {
    enabled: true,
    toolsAvailable: [
      'getTreatmentRegimen',
      'checkTreatmentCoverage',
      'findClinicalTrials'
    ]
  },
  
  // Data Sources
  dataSources: {
    /* PDF·엑셀·한글 파일은 hiraMonitor 가 /files/ 로 서빙 */
    treatmentGuidelinesPath: null,
    coverageDataPath: null,
    clinicalTrialsPath: null
  },
  
  // Client Settings
  client: {
    defaultLanguage: 'ko',
    supportedLanguages: ['ko', 'en'],
    defaultCancerTypes: [
      '폐암', '유방암', '대장암', '위암', '간암',
      '췌장암', '전립선암', '자궁경부암', '혈액암', '기타'
    ]
  }
}; 
import React, { useState, useEffect } from 'react';
import mcpClient from '../utils/mcpClient';
import './McpTools.css';

const McpTools = () => {
  const [connected, setConnected] = useState(false);
  const [connectionError, setConnectionError] = useState(null);
  const [availableTools, setAvailableTools] = useState([]);
  
  // Treatment regimen states
  const [cancerType, setCancerType] = useState('');
  const [stage, setStage] = useState('');
  const [biomarkers, setBiomarkers] = useState('');
  const [treatmentResults, setTreatmentResults] = useState(null);
  const [loadingTreatment, setLoadingTreatment] = useState(false);
  
  // Coverage check states
  const [treatmentName, setTreatmentName] = useState('');
  const [coverageCancerType, setCoverageCancerType] = useState('');
  const [coverageResults, setCoverageResults] = useState(null);
  const [loadingCoverage, setLoadingCoverage] = useState(false);
  
  // Clinical trials states
  const [trialsCancerType, setTrialsCancerType] = useState('');
  const [location, setLocation] = useState('Seoul');
  const [age, setAge] = useState('');
  const [trialsResults, setTrialsResults] = useState(null);
  const [loadingTrials, setLoadingTrials] = useState(false);
  
  // Patient Medical Record Analysis states
  const [patientRecord, setPatientRecord] = useState('');
  const [analysisResults, setAnalysisResults] = useState(null);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);

  // Try to connect to the MCP server on component mount
  useEffect(() => {
    const connectToMcp = async () => {
      try {
        const result = await mcpClient.initialize();
        setConnected(result.connected);
        
        if (result.connected) {
          setAvailableTools(result.tools);
        } else {
          setConnectionError(result.error);
        }
      } catch (error) {
        setConnected(false);
        setConnectionError(error.message);
      }
    };
    
    connectToMcp();
    
    // Cleanup on unmount
    return () => {
      mcpClient.close();
    };
  }, []);

  const handleGetTreatment = async (e) => {
    e.preventDefault();
    setLoadingTreatment(true);
    setTreatmentResults(null);
    
    try {
      // Convert comma-separated biomarkers to array
      const biomarkersArray = biomarkers
        .split(',')
        .map(b => b.trim())
        .filter(Boolean);
      
      const results = await mcpClient.getTreatmentRegimen(
        cancerType, 
        stage, 
        biomarkersArray
      );
      
      setTreatmentResults(results);
    } catch (error) {
      setTreatmentResults({ error: error.message });
    } finally {
      setLoadingTreatment(false);
    }
  };

  const handleCheckCoverage = async (e) => {
    e.preventDefault();
    setLoadingCoverage(true);
    setCoverageResults(null);
    
    try {
      const results = await mcpClient.checkTreatmentCoverage(
        treatmentName,
        coverageCancerType
      );
      
      setCoverageResults(results);
    } catch (error) {
      setCoverageResults({ error: error.message });
    } finally {
      setLoadingCoverage(false);
    }
  };

  const handleFindTrials = async (e) => {
    e.preventDefault();
    setLoadingTrials(true);
    setTrialsResults(null);
    
    try {
      const patientDetails = { age: parseInt(age) || undefined };
      
      const results = await mcpClient.findClinicalTrials(
        trialsCancerType,
        location,
        patientDetails
      );
      
      setTrialsResults(results);
    } catch (error) {
      setTrialsResults({ error: error.message });
    } finally {
      setLoadingTrials(false);
    }
  };

  const handleAnalyzePatientRecord = async (e) => {
    e.preventDefault();
    setLoadingAnalysis(true);
    setAnalysisResults(null);
    
    try {
      const results = await mcpClient.analyzePatientRecord(patientRecord);
      
      setAnalysisResults(results);
    } catch (error) {
      setAnalysisResults({ error: error.message });
    } finally {
      setLoadingAnalysis(false);
    }
  };

  if (!connected) {
    return (
      <div className="mcp-tools error-container">
        <h2>MCP Connection Error</h2>
        <p>Unable to connect to the MCP server. Please check that the server is running.</p>
        {connectionError && <p className="error-message">{connectionError}</p>}
      </div>
    );
  }

  return (
    <div className="mcp-tools">
      <h2>암 치료 정보 도구</h2>
      <p className="connected-message">MCP 서버에 연결됨: {availableTools.length} 도구 사용 가능</p>
      
      <div className="tools-container">
        {/* Patient Record Analysis Tool */}
        <div className="tool-card">
          <h3>의무기록 분석</h3>
          <form onSubmit={handleAnalyzePatientRecord}>
            <div className="form-group">
              <label htmlFor="patientRecord">환자 의무기록:</label>
              <textarea
                id="patientRecord"
                value={patientRecord}
                onChange={(e) => setPatientRecord(e.target.value)}
                placeholder="예: 환자는 폐암 4기, EGFR 변이 양성으로 진단받았으며..."
                rows={5}
                required
              ></textarea>
            </div>
            
            <button type="submit" disabled={loadingAnalysis}>
              {loadingAnalysis ? '분석 중...' : '의무기록 분석하기'}
            </button>
          </form>
          
          {analysisResults && (
            <div className="results-container">
              {analysisResults.error ? (
                <p className="error-message">{analysisResults.error}</p>
              ) : !analysisResults.success ? (
                <div>
                  <h4>분석 결과:</h4>
                  <p>{analysisResults.message}</p>
                  
                  <h5>추출된 정보:</h5>
                  <ul>
                    <li><strong>암종:</strong> {analysisResults.extracted.cancerType}</li>
                    <li><strong>병기:</strong> {analysisResults.extracted.stage}</li>
                    <li><strong>바이오마커:</strong> {analysisResults.extracted.biomarkers.join(', ')}</li>
                  </ul>
                </div>
              ) : (
                <div>
                  <h4>분석 결과:</h4>
                  <h5>환자 정보:</h5>
                  <ul>
                    <li><strong>암종:</strong> {analysisResults.patientInfo.cancerType}</li>
                    <li><strong>병기:</strong> {analysisResults.patientInfo.stage}</li>
                    <li><strong>바이오마커:</strong> {analysisResults.patientInfo.biomarkers.join(', ')}</li>
                  </ul>
                  
                  <h5>권장 치료법:</h5>
                  <ul>
                    {analysisResults.recommendedRegimens.map((regimen, index) => (
                      <li key={index} className="regimen-item">
                        <strong>{regimen.name}</strong>
                        <p>{regimen.description}</p>
                        <p>약물: {regimen.medications.join(', ')}</p>
                        <p>보험 적용: {regimen.coverageStatus}</p>
                        <p>급여 조건: {regimen.coverageInfo}</p>
                        <p>근거 수준: {regimen.evidenceLevel}</p>
                        <p>참고문헌: {regimen.reference}</p>
                      </li>
                    ))}
                  </ul>
                  <p className="notes">{analysisResults.notes}</p>
                </div>
              )}
            </div>
          )}
        </div>
        
        {/* Treatment Regimen Tool */}
        <div className="tool-card">
          <h3>치료 요법 찾기</h3>
          <form onSubmit={handleGetTreatment}>
            <div className="form-group">
              <label htmlFor="cancerType">암 종류:</label>
              <input
                id="cancerType"
                type="text"
                value={cancerType}
                onChange={(e) => setCancerType(e.target.value)}
                placeholder="예: 폐암, 유방암"
                required
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="stage">병기:</label>
              <input
                id="stage"
                type="text"
                value={stage}
                onChange={(e) => setStage(e.target.value)}
                placeholder="예: I, II, III, IV"
                required
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="biomarkers">바이오마커 (콤마로 구분):</label>
              <input
                id="biomarkers"
                type="text"
                value={biomarkers}
                onChange={(e) => setBiomarkers(e.target.value)}
                placeholder="예: EGFR+, HER2-"
              />
            </div>
            
            <button type="submit" disabled={loadingTreatment}>
              {loadingTreatment ? '로딩 중...' : '치료 요법 찾기'}
            </button>
          </form>
          
          {treatmentResults && (
            <div className="results-container">
              {treatmentResults.error ? (
                <p className="error-message">{treatmentResults.error}</p>
              ) : (
                <div>
                  <h4>추천 치료 요법:</h4>
                  <ul>
                    {treatmentResults.recommendedRegimens.map((regimen, index) => (
                      <li key={index} className="regimen-item">
                        <strong>{regimen.name}</strong>
                        <p>{regimen.description}</p>
                        <p>약물: {regimen.medications.join(', ')}</p>
                        <p>보험 적용: {regimen.coverageStatus}</p>
                        <p>근거 수준: {regimen.evidenceLevel}</p>
                      </li>
                    ))}
                  </ul>
                  <p className="notes">{treatmentResults.notes}</p>
                </div>
              )}
            </div>
          )}
        </div>
        
        {/* Treatment Coverage Tool */}
        <div className="tool-card">
          <h3>보험 적용 확인</h3>
          <form onSubmit={handleCheckCoverage}>
            <div className="form-group">
              <label htmlFor="treatmentName">치료 또는 약물명:</label>
              <input
                id="treatmentName"
                type="text"
                value={treatmentName}
                onChange={(e) => setTreatmentName(e.target.value)}
                placeholder="예: Pembrolizumab, FOLFOX"
                required
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="coverageCancerType">암 종류:</label>
              <input
                id="coverageCancerType"
                type="text"
                value={coverageCancerType}
                onChange={(e) => setCoverageCancerType(e.target.value)}
                placeholder="예: 폐암, 유방암"
                required
              />
            </div>
            
            <button type="submit" disabled={loadingCoverage}>
              {loadingCoverage ? '로딩 중...' : '보험 적용 확인'}
            </button>
          </form>
          
          {coverageResults && (
            <div className="results-container">
              {coverageResults.error ? (
                <p className="error-message">{coverageResults.error}</p>
              ) : (
                <div>
                  <h4>보험 적용 정보: {coverageResults.treatmentName}</h4>
                  <p><strong>적용 상태:</strong> {coverageResults.coverageStatus}</p>
                  
                  <h5>적용 조건:</h5>
                  <ul>
                    {coverageResults.conditions.map((condition, index) => (
                      <li key={index}>{condition}</li>
                    ))}
                  </ul>
                  
                  <h5>예상 비용:</h5>
                  <p>보험적용: {coverageResults.estimatedCosts.insuredAmount}</p>
                  <p>본인부담: {coverageResults.estimatedCosts.patientResponsibility}</p>
                  
                  <h5>관련 규정:</h5>
                  <ul>
                    {coverageResults.relevantRegulations.map((regulation, index) => (
                      <li key={index}>{regulation}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
        
        {/* Clinical Trials Tool */}
        <div className="tool-card">
          <h3>임상시험 찾기</h3>
          <form onSubmit={handleFindTrials}>
            <div className="form-group">
              <label htmlFor="trialsCancerType">암 종류:</label>
              <input
                id="trialsCancerType"
                type="text"
                value={trialsCancerType}
                onChange={(e) => setTrialsCancerType(e.target.value)}
                placeholder="예: 폐암, 유방암"
                required
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="location">지역:</label>
              <input
                id="location"
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="예: 서울, 부산"
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="age">환자 나이:</label>
              <input
                id="age"
                type="number"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                placeholder="예: 45"
              />
            </div>
            
            <button type="submit" disabled={loadingTrials}>
              {loadingTrials ? '로딩 중...' : '임상시험 찾기'}
            </button>
          </form>
          
          {trialsResults && (
            <div className="results-container">
              {trialsResults.error ? (
                <p className="error-message">{trialsResults.error}</p>
              ) : (
                <div>
                  <h4>사용 가능한 임상시험:</h4>
                  {trialsResults.availableTrials.map((trial, index) => (
                    <div key={index} className="trial-item">
                      <h5>{trial.title}</h5>
                      <p><strong>ID:</strong> {trial.id}</p>
                      <p><strong>단계:</strong> {trial.phase}</p>
                      <p><strong>위치:</strong> {trial.location}</p>
                      <p><strong>연락처:</strong> {trial.contactInformation}</p>
                      
                      <h6>지원 자격:</h6>
                      <ul>
                        {trial.eligibilityCriteria.map((criteria, idx) => (
                          <li key={idx}>{criteria}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                  <p className="notes">{trialsResults.notes}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default McpTools; 
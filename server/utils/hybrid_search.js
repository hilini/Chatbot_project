import { OpenAIEmbeddings } from '@langchain/openai';
import { FaissStore } from '@langchain/community/vectorstores/faiss';
import fs from 'fs';
import path from 'path';

class HybridSearch {
  constructor(embeddings, vectorStore) {
    this.embeddings = embeddings;
    this.vectorStore = vectorStore;
    this.medicalChunker = null; // 나중에 import
  }

  // 하이브리드 검색 (벡터 + 키워드)
  async hybridSearch(query, limit = 5) {
    console.log(`하이브리드 검색 시작: "${query}"`);
    
    // 1. 쿼리 분석
    const queryAnalysis = this.analyzeQuery(query);
    
    // 2. 벡터 검색
    const vectorResults = await this.vectorSearch(query, limit * 2);
    
    // 3. 키워드 검색
    const keywordResults = await this.keywordSearch(query, limit * 2);
    
    // 4. 결과 결합 및 재순위화
    const combinedResults = this.combineAndRerank(
      vectorResults, 
      keywordResults, 
      queryAnalysis,
      limit
    );
    
    console.log(`하이브리드 검색 완료: ${combinedResults.length}개 결과`);
    return combinedResults;
  }

  // 쿼리 분석
  analyzeQuery(query) {
    const analysis = {
      type: 'general', // general, drug, disease, symptom, procedure
      entities: {
        drugs: [],
        diseases: [],
        symptoms: [],
        procedures: []
      },
      keywords: [],
      medicalTerms: []
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
      const matches = query.match(pattern);
      if (matches) {
        analysis.entities.drugs.push(...matches);
        analysis.type = 'drug';
      }
    });

    diseasePatterns.forEach(pattern => {
      const matches = query.match(pattern);
      if (matches) {
        analysis.entities.diseases.push(...matches);
        analysis.type = 'disease';
      }
    });

    symptomPatterns.forEach(pattern => {
      const matches = query.match(pattern);
      if (matches) {
        analysis.entities.symptoms.push(...matches);
        analysis.type = 'symptom';
      }
    });

    procedurePatterns.forEach(pattern => {
      const matches = query.match(pattern);
      if (matches) {
        analysis.entities.procedures.push(...matches);
        analysis.type = 'procedure';
      }
    });

    // 키워드 추출
    const keywords = ['급여기준', '적응증', '용량', '투여방법', '주의사항', '부작용', '상호작용'];
    analysis.keywords = keywords.filter(keyword => query.includes(keyword));

    // 의료 용어 추출
    const medicalTerms = ['면역항암제', '항암제', '화학요법', '방사선치료', '면역치료'];
    analysis.medicalTerms = medicalTerms.filter(term => query.includes(term));

    return analysis;
  }

  // 벡터 검색
  async vectorSearch(query, limit) {
    if (!this.vectorStore) {
      console.warn('벡터 스토어가 없습니다.');
      return [];
    }

    try {
      const results = await this.vectorStore.similaritySearchWithScore(query, limit);
      return results.map(([doc, score]) => ({
        content: doc.pageContent,
        score: score,
        sourceInfo: doc.metadata,
        searchType: 'vector'
      }));
    } catch (error) {
      console.error('벡터 검색 오류:', error);
      return [];
    }
  }

  // 키워드 검색
  async keywordSearch(query, limit) {
    try {
      // 메타데이터 파일에서 검색
      const metadataPath = path.join(__dirname, '../data/vector/metadata.json');
      if (!fs.existsSync(metadataPath)) {
        return [];
      }

      const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
      const results = [];

      // 파일 메타데이터에서 키워드 검색
      for (const [key, fileInfo] of Object.entries(metadata.files)) {
        if (!fileInfo.textContent) continue;

        const textContent = fileInfo.textContent.toLowerCase();
        const queryLower = query.toLowerCase();
        
        // 키워드 매칭 점수 계산
        let score = 0;
        const keywords = queryLower.split(/\s+/);
        
        keywords.forEach(keyword => {
          const count = (textContent.match(new RegExp(keyword, 'g')) || []).length;
          score += count * 0.1; // 키워드 등장 횟수에 따른 점수
        });

        // 정확한 매칭에 더 높은 점수
        if (textContent.includes(queryLower)) {
          score += 1.0;
        }

        if (score > 0) {
          results.push({
            content: fileInfo.textContent.substring(0, 500) + '...',
            score: score,
            sourceInfo: {
              boardId: fileInfo.boardId,
              postNo: fileInfo.postNo,
              filename: fileInfo.filename,
              filePath: fileInfo.filePath,
              type: 'text'
            },
            searchType: 'keyword'
          });
        }
      }

      // 점수순 정렬 및 제한
      return results
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

    } catch (error) {
      console.error('키워드 검색 오류:', error);
      return [];
    }
  }

  // 결과 결합 및 재순위화
  combineAndRerank(vectorResults, keywordResults, queryAnalysis, limit) {
    const combined = new Map();

    // 벡터 검색 결과 추가
    vectorResults.forEach(result => {
      const key = `${result.sourceInfo.boardId}_${result.sourceInfo.postNo}_${result.sourceInfo.chunkIndex || 0}`;
      combined.set(key, {
        ...result,
        finalScore: result.score * 0.7 // 벡터 검색 가중치
      });
    });

    // 키워드 검색 결과 추가/업데이트
    keywordResults.forEach(result => {
      const key = `${result.sourceInfo.boardId}_${result.sourceInfo.postNo}_0`;
      
      if (combined.has(key)) {
        // 기존 결과가 있으면 점수 업데이트
        const existing = combined.get(key);
        existing.finalScore += result.score * 0.3; // 키워드 검색 가중치
        existing.searchType = 'hybrid';
      } else {
        // 새로운 결과 추가
        combined.set(key, {
          ...result,
          finalScore: result.score * 0.3
        });
      }
    });

    // 의료 엔티티 기반 추가 점수
    combined.forEach(result => {
      let bonus = 0;
      
      // 약물명 매칭 보너스
      queryAnalysis.entities.drugs.forEach(drug => {
        if (result.content.includes(drug)) {
          bonus += 0.2;
        }
      });

      // 질병명 매칭 보너스
      queryAnalysis.entities.diseases.forEach(disease => {
        if (result.content.includes(disease)) {
          bonus += 0.2;
        }
      });

      // 키워드 매칭 보너스
      queryAnalysis.keywords.forEach(keyword => {
        if (result.content.includes(keyword)) {
          bonus += 0.1;
        }
      });

      result.finalScore += bonus;
    });

    // 최종 점수순 정렬
    return Array.from(combined.values())
      .sort((a, b) => b.finalScore - a.finalScore)
      .slice(0, limit);
  }

  // 섹션별 검색
  async searchBySection(query, section, limit = 3) {
    if (!this.vectorStore) return [];

    try {
      const results = await this.vectorStore.similaritySearchWithScore(query, limit * 3);
      
      // 특정 섹션만 필터링
      const filteredResults = results
        .filter(([doc, score]) => doc.metadata.section === section)
        .map(([doc, score]) => ({
          content: doc.pageContent,
          score: score,
          sourceInfo: doc.metadata,
          searchType: 'section'
        }))
        .slice(0, limit);

      return filteredResults;
    } catch (error) {
      console.error('섹션별 검색 오류:', error);
      return [];
    }
  }
}

export default HybridSearch; 
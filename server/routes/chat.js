import express from 'express';
import { searchWithSources } from '../utils/hira_data_module.js';
import path from 'path';
import fs from 'fs';
import { VECTOR_DIR } from '../config/config.js';

const router = express.Router();

// 소스 추적 검색 API
router.post('/search', async (req, res) => {
  try {
    const { query, limit = 5 } = req.body;
    
    if (!query) {
      return res.status(400).json({ 
        error: '검색어를 입력해주세요.' 
      });
    }

    const { results, sources } = await searchWithSources(query, limit);
    
    res.json({
      success: true,
      query,
      results: results.map(r => ({
        content: r.content,
        score: r.score,
        sourceInfo: r.sourceInfo
      })),
      sources,
      totalResults: results.length,
      totalSources: sources.length
    });
    
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ 
      error: '검색 중 오류가 발생했습니다.' 
    });
  }
});

// 소스 정보 조회 API
router.get('/sources/:boardId/:postNo', async (req, res) => {
  try {
    const { boardId, postNo } = req.params;
    
    // 특정 게시글의 소스 정보 조회
    const storePath = path.join(VECTOR_DIR, 'hira');
    const storeFile = path.join(storePath, 'documents.json');
    
    if (!fs.existsSync(storeFile)) {
      return res.status(404).json({ 
        error: '문서를 찾을 수 없습니다.' 
      });
    }
    
    const documents = JSON.parse(fs.readFileSync(storeFile, 'utf-8'));
    const sources = documents
      .filter(doc => doc.sourceInfo.boardId === boardId && doc.sourceInfo.postNo == postNo)
      .map(doc => doc.sourceInfo);
    
    res.json({
      success: true,
      boardId,
      postNo,
      sources
    });
    
  } catch (error) {
    console.error('Source info error:', error);
    res.status(500).json({ 
      error: '소스 정보 조회 중 오류가 발생했습니다.' 
    });
  }
});

export default router; 
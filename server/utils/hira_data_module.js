// hira_data_module.js — v2.2 (dependency sync)
// =============================================================================
// 공고 탭(board A) 새 게시 → 같은 시점에 **항암화학요법 탭(board B)도 항상 재‑다운/재‑임베딩**
// • boardIds: A=HIRAA030023010000  (보험 급여기준 공고)
//             B=HIRAA030023030000  (항암화학요법)
// • 로직: A에서 신규 post 탐지 → flag set → B 강제 force 재싱크 (첨부 변동 대응)
// ----------------------------------------------------------------------------
// (나머지 설명 & 의존성은 동일 – v2.1에서 증분 패치만.)
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import * as cheerio from 'cheerio';
import textract from 'textract';
import xlsx from 'xlsx';
import iconv from 'iconv-lite';
import cron from 'node-cron';
import minimist from 'minimist';
import HWP from 'hwp.js';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';

import { OpenAIEmbeddings } from '@langchain/openai';
import { Document } from 'langchain/document';
import 'dotenv/config';

// --------------------------- Paths & constants --------------------------------
const DATA_DIR       = path.resolve('./data');
const RAW_DIR        = path.join(DATA_DIR, 'raw');
const TEXT_DIR       = path.join(DATA_DIR, 'text');
const VECTOR_DIR     = path.join(DATA_DIR, 'vector_store');
const REGISTRY_PATH  = path.join(DATA_DIR, 'registry.json');

// board A = 공고, board B = 항암화학요법
const BOARD_A = 'HIRAA030023010000';
const BOARD_B = 'HIRAA030023030000';

const CRAWL_TARGETS  = [
  { boardId: BOARD_A, limit: 3 }, // 최근 3개 확인 (새로운 게시글 놓치지 않기 위해)
  { boardId: BOARD_B, limit: 3 }
];

const CHUNK_SIZE     = 1000;
const CHUNK_OVERLAP  = 200;
const splitter = new RecursiveCharacterTextSplitter({ chunkSize: CHUNK_SIZE, chunkOverlap: CHUNK_OVERLAP });

async function createDocumentsFromText(text, meta) {
  return (await splitter.splitText(text)).map((c, i) => new Document({
    pageContent: c,
    metadata: { ...meta, chunk: i }
  }));
}
const DAILY_CRON_KST = '15 2 * * *'; // 02:15 every day (Asia/Seoul)

// --------------------------- Utilities ---------------------------------------
// 임시로 embeddings 비활성화
// const embeddings = new OpenAIEmbeddings({
//   openAIApiKey: process.env.OPENAI_API_KEY,
//   modelName: process.env.OPENAI_EMBED_MODEL || 'text-embedding-ada-002'
// });

[DATA_DIR, RAW_DIR, TEXT_DIR, VECTOR_DIR].forEach((p) => {
  fs.mkdirSync(p, { recursive: true });
  console.log('폴더 생성됨:', p);
});

function loadRegistry() {
  try { return fs.existsSync(REGISTRY_PATH) ? JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf-8')) : {}; }
  catch { return {}; }
}
function saveRegistry(reg) { fs.writeFileSync(REGISTRY_PATH, JSON.stringify(reg, null, 2)); }

// --------------------------- 1. CRAWLER --------------------------------------
async function fetchBoard(boardId, limit = 1) {
  const url = `https://www.hira.or.kr/bbsDummy.do?pgmid=${boardId}`;
  console.log(`Fetching board: ${url}`);
  
  try {
    const { data } = await axios.get(url, { 
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    
    const decodedData = iconv.decode(data, 'utf-8');
    const $ = cheerio.load(decodedData);
    const posts = [];
    
    console.log(`Parsing board ${boardId}...`);
    
    // 게시판 테이블 구조에 맞게 수정
    $('table tbody tr').slice(0, limit).each((idx, el) => {
      const tds = $(el).find('td');
      if (tds.length === 0) return;
      
      // 게시글 번호 추출 (첫 번째 컬럼)
      const noText = tds.eq(0).text().trim();
      const no = parseInt(noText, 10);
      
      // 제목 링크 찾기 (col-tit 클래스가 있는 셀에서 찾기)
      let titleCell = null;
      let a = null;
      
      // col-tit 클래스가 있는 셀 찾기
      for (let i = 0; i < tds.length; i++) {
        const cell = tds.eq(i);
        if (cell.hasClass('col-tit') || cell.find('a').length > 0) {
          titleCell = cell;
          a = cell.find('a').first();
          break;
        }
      }
      
      // fallback: 세 번째 셀에서 찾기
      if (!titleCell) {
        titleCell = tds.eq(2) || tds.eq(1) || tds.eq(0);
        a = titleCell.find('a').first();
      }
      
      // 항암화학요법 게시판의 경우 제목이 링크가 아닐 수 있음
      if (!a.length && boardId === BOARD_B) {
        console.log(`Board ${boardId}: No link found, this might be a static content page`);
        // 항암화학요법 게시판은 현재 페이지가 게시글 상세 페이지일 수 있음
        const currentUrl = `https://www.hira.or.kr/bbsDummy.do?pgmid=${boardId}`;
        posts.push({ 
          boardId, 
          postNo: no, 
          title: titleCell.text().trim(), 
          detailUrl: currentUrl 
        });
        return; // continue 대신 return 사용
      }
      
      if (!a.length || Number.isNaN(no)) {
        console.log(`Skip row ${idx}: no link or invalid number (${noText})`);
        return;
      }
      
      const href = a.attr('href');
      if (!href) {
        console.log(`Skip row ${idx}: no href attribute`);
        return;
      }
      
      // 상대 URL을 절대 URL로 변환
      let detailUrl = href.startsWith('http') ? href : new URL(href, 'https://www.hira.or.kr').href;
      
      // 게시글 상세 페이지 URL이 올바른지 확인하고 수정
      if (detailUrl.includes('?pgmid=')) {
        // 게시글 상세 페이지는 bbsDummy.do를 그대로 사용
        if (detailUrl.includes('bbsView.do')) {
          detailUrl = detailUrl.replace('bbsView.do', 'bbsDummy.do');
        }
        // URL이 이상하게 생성된 경우 수정
        if (detailUrl.includes('https://www.hira.or.kr/?pgmid=')) {
          detailUrl = detailUrl.replace('https://www.hira.or.kr/?pgmid=', 'https://www.hira.or.kr/bbsDummy.do?pgmid=');
        }
      }
      const title = a.text().trim();
      
      console.log(`Found post #${no}: "${title}" -> ${detailUrl}`);
      
      posts.push({ 
        boardId, 
        postNo: no, 
        title: title, 
        detailUrl: detailUrl 
      });
    });
    
    console.log(`Found ${posts.length} posts from board ${boardId}`);
    return posts;
    
  } catch (error) {
    console.error(`Error fetching board ${boardId}:`, error.message);
    return [];
  }
}

async function fetchPost(post) {
  console.log(`Fetching post: ${post.detailUrl}`);
  
  try {
    const { data } = await axios.get(post.detailUrl, { 
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    
    const decodedData = iconv.decode(data, 'utf-8');
    const $ = cheerio.load(decodedData);
    
    // 리다이렉트 체크
    if (decodedData.includes('location.href=') || decodedData.includes('window.location')) {
      console.warn('Redirect detected, URL might be wrong');
      console.log('Current URL:', post.detailUrl);
      
      // URL이 잘못된 경우 수정 시도
      let correctedUrl = post.detailUrl;
      if (correctedUrl.includes('https://www.hira.or.kr/?pgmid=')) {
        correctedUrl = correctedUrl.replace('https://www.hira.or.kr/?pgmid=', 'https://www.hira.or.kr/bbsDummy.do?pgmid=');
        console.log('Trying corrected URL:', correctedUrl);
        
        try {
          const altResponse = await axios.get(correctedUrl, { 
            responseType: 'arraybuffer',
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
          });
          const altDecodedData = iconv.decode(altResponse.data, 'utf-8');
          const $alt = cheerio.load(altDecodedData);
          console.log('Corrected URL worked, using it for content extraction...');
          // 수정된 URL에서 내용 추출 시도
          $ = $alt;
        } catch (altError) {
          console.warn('Corrected URL also failed:', altError.message);
        }
      }
    }
    
    // 게시글 내용 추출 - div.view 안의 p 태그들
    let bodyText = '';
    const viewDiv = $('.view');
    if (viewDiv.length > 0) {
      const paragraphs = viewDiv.find('p');
      if (paragraphs.length > 0) {
        bodyText = paragraphs.map((_, p) => $(p).text().trim()).get().join('\n\n');
        console.log(`Found ${paragraphs.length} paragraphs in .view div`);
      } else {
        // p 태그가 없으면 div.view의 전체 텍스트
        bodyText = viewDiv.text().trim();
        console.log('No p tags found, using .view div text');
      }
    }
    
    console.log(`Initial content extraction: ${bodyText.length} characters`);
    
    if (bodyText.length === 0) {
      console.warn('Content block not found, trying alternative selectors...');
      // 다른 선택자들 시도
      const altSelectors = ['.board_view', '.content', '.text', 'table', '.board_view_cont', '.view_area', '.board_view_cont_area', '.cont_area'];
      for (const selector of altSelectors) {
        const altText = $(selector).text().trim();
        if (altText.length > bodyText.length) {
          console.log(`Alternative selector "${selector}" found ${altText.length} characters`);
          bodyText = altText;
        }
      }
      
      // 항암화학요법 게시판 특별 처리
      if (post.boardId === BOARD_B) {
        console.log('Special handling for anticancer therapy board...');
        // 테이블에서 실제 내용 추출
        const tableContent = [];
        $('table tbody tr').each((_, tr) => {
          const tds = $(tr).find('td');
          if (tds.length >= 2) {
            const title = tds.eq(1).text().trim();
            if (title && title.length > 5) {
              tableContent.push(title);
            }
          }
        });
        if (tableContent.length > 0) {
          bodyText = tableContent.join('\n\n');
          console.log(`Extracted ${tableContent.length} table rows for anticancer therapy board`);
        } else {
          // 테이블이 없으면 기본 내용 사용
          console.log('No table content found, using default content extraction');
        }
      }
      
      // 마지막 수단: 전체 body에서 의미있는 텍스트 추출
      if (bodyText.length === 0) {
        const allText = $('body').text();
        const lines = allText.split('\n').filter(line => line.trim().length > 10);
        bodyText = lines.join('\n');
        console.log(`Fallback: extracted ${bodyText.length} characters from body`);
      }
    }

    const textFile = path.join(TEXT_DIR, `${post.boardId}_${post.postNo}.txt`);
    fs.writeFileSync(textFile, bodyText);
    console.log(`Saved text file: ${textFile} (${bodyText.length} characters)`);

    const attachments = [];
    
    // 첨부파일 찾기 - 게시판별로 다른 구조 처리
    if (post.boardId === BOARD_B) {
      // 항암화학요법 게시판: 테이블에서 다운로드 버튼 찾기
      console.log('Processing anticancer therapy board attachments...');
      
      $('table tbody tr').each((_, tr) => {
        const tds = $(tr).find('td');
        if (tds.length >= 3) {
          const title = tds.eq(1).text().trim(); // 제목
          const downloadCell = tds.eq(2); // 첨부 셀
          const downloadLink = downloadCell.find('a.btn_file');
          
          if (downloadLink.length > 0) {
            const onclick = downloadLink.attr('onclick') || '';
            console.log(`Found download link for "${title}": ${onclick}`);
            
            // downLoadBbs 함수 호출 패턴 - 더 정확한 정규식 사용
            if (/downLoadBbs/.test(onclick)) {
              // 다양한 패턴 시도
              let m = onclick.match(/downLoadBbs\s*\(\s*['"]([^'"]+)['"],\s*['"]([^'"]+)['"],\s*['"]([^'"]+)['"],\s*['"]([^'"]+)['"]\s*\)/);
              
              if (!m) {
                // 공백이 없는 패턴도 시도
                m = onclick.match(/downLoadBbs\s*\(\s*['"]([^'"]+)['"],\s*['"]([^'"]+)['"],\s*['"]([^'"]+)['"],\s*['"]([^'"]+)['"]\s*\)/);
              }
              
              if (!m) {
                // 숫자만 있는 패턴도 시도
                m = onclick.match(/downLoadBbs\s*\(\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+)\s*\)/);
              }
              
              if (m) {
                const [_, param1, param2, param3, param4] = m;
                console.log(`downLoadBbs parameters for "${title}": ${param1}, ${param2}, ${param3}, ${param4}`);
                
                // 파라미터 검증
                if (param1 && param2 && param3) {
                  // 실제 사이트 분석 결과:
                  // param1: fileSeq (파일 순서) - '1', '2' 등
                  // param2: brdBltNo (게시글 번호) - '8', '7' 등  
                  // param3: brdScnBltNo (게시판 번호) - '5' 등
                  // param4: 추가 파라미터 - '487' 등
                  
                  // 실제 사이트 분석 결과에 따른 정확한 URL 패턴
                  const downloadUrl = `/bbs/bbsCDownLoad.do?apndNo=${param1}&apndBrdBltNo=${param2}&apndBrdTyNo=${param3}&apndBltNo=${param4}`;
                  
                  console.log(`Generated download URL for "${title}": ${downloadUrl}`);
                  const fullUrl = new URL(downloadUrl, 'https://www.hira.or.kr').href;
                  if (!attachments.includes(fullUrl)) {
                    attachments.push(fullUrl);
                    console.log(`  Added: ${fullUrl}`);
                  }
                } else {
                  console.warn(`Invalid downLoadBbs parameters for "${title}": ${param1}, ${param2}, ${param3}, ${param4}`);
                }
              } else {
                console.warn(`Failed to parse downLoadBbs function call: ${onclick}`);
              }
            }
          }
        }
      });
    } else {
      // 공고 게시판: div.fileBox 안의 파일들
      const fileBox = $('.fileBox');
      if (fileBox.length > 0) {
        console.log('Found .fileBox, looking for attachments...');
        
        fileBox.find('a').each((_, a) => {
          const href = $(a).attr('href') || '';
          const onclick = $(a).attr('onclick') || '';
          const text = $(a).text().trim();
          
          console.log(`Found file link: href="${href}", onclick="${onclick}", text="${text}"`);
          
          const push = (link) => {
            const fullUrl = link.startsWith('http') ? link : new URL(link, 'https://www.hira.or.kr').href;
            if (!attachments.includes(fullUrl)) {
              attachments.push(fullUrl);
              console.log(`Added attachment: ${fullUrl}`);
            } else {
              console.log(`Skipped duplicate attachment: ${fullUrl}`);
            }
          };
          
          // downLoadBbs 함수 호출 패턴 (공고 게시판에서도 사용)
          if (/downLoadBbs/.test(onclick)) {
            let m = onclick.match(/downLoadBbs\s*\(\s*['"]([^'"]+)['"],\s*['"]([^'"]+)['"],\s*['"]([^'"]+)['"],\s*['"]([^'"]+)['"]\s*\)/);
            
            if (!m) {
              // 공백이 없는 패턴도 시도
              m = onclick.match(/downLoadBbs\s*\(\s*['"]([^'"]+)['"],\s*['"]([^'"]+)['"],\s*['"]([^'"]+)['"],\s*['"]([^'"]+)['"]\s*\)/);
            }
            
            if (!m) {
              // 숫자만 있는 패턴도 시도
              m = onclick.match(/downLoadBbs\s*\(\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+)\s*\)/);
            }
            
            if (m) {
              const [_, param1, param2, param3, param4] = m;
              console.log(`downLoadBbs parameters (공고): ${param1}, ${param2}, ${param3}, ${param4}`);
              
              if (param1 && param2 && param3) {
                // 공고 게시판의 실제 다운로드 URL 패턴
                // param1: fileSeq (파일 순서)
                // param2: brdBltNo (게시글 번호)
                // param3: brdScnBltNo (게시판 번호)
                // param4: 추가 파라미터
                const downloadUrl = `/bbs/bbsCDownLoad.do?apndNo=${param1}&apndBrdBltNo=${param2}&apndBrdTyNo=${param3}&apndBltNo=${param4}`;
                console.log(`Generated download URL (공고): ${downloadUrl}`);
                console.log(`Parameters: fileSeq=${param1}, brdBltNo=${param2}, brdScnBltNo=${param3}, extra=${param4}`);
                push(downloadUrl);
              } else {
                console.warn(`Invalid downLoadBbs parameters (공고): ${param1}, ${param2}, ${param3}, ${param4}`);
              }
            } else {
              console.warn(`Failed to parse downLoadBbs function call (공고): ${onclick}`);
            }
          }
          
          // fileDownloadBbsBltFile 함수 호출 패턴 (공고 게시판) - 더 정확한 정규식 사용
          if (/fileDownloadBbsBltFile/.test(onclick)) {
            let m = onclick.match(/fileDownloadBbsBltFile\s*\(\s*['"]([^'"]+)['"],\s*(\d+),\s*(\d+),\s*(\d+)\s*\)/);
            
            if (!m) {
              // 공백이 없는 패턴도 시도
              m = onclick.match(/fileDownloadBbsBltFile\s*\(\s*['"]([^'"]+)['"],\s*(\d+),\s*(\d+),\s*(\d+)\s*\)/);
            }
            
            if (m) {
              const [_, pgmid, brdBltNo, brdScnBltNo, fileSeq] = m;
              console.log(`fileDownloadBbsBltFile parameters: ${pgmid}, ${brdBltNo}, ${brdScnBltNo}, ${fileSeq}`);
              
              if (pgmid && brdBltNo && brdScnBltNo && fileSeq) {
                const downloadUrl = `/fileDownloadBbsBltFile.do?pgmid=${pgmid}&brdBltNo=${brdBltNo}&brdScnBltNo=${brdScnBltNo}&fileSeq=${fileSeq}`;
                push(downloadUrl);
              } else {
                console.warn(`Invalid fileDownloadBbsBltFile parameters: ${pgmid}, ${brdBltNo}, ${brdScnBltNo}, ${fileSeq}`);
              }
            } else {
              console.warn(`Failed to parse fileDownloadBbsBltFile function call: ${onclick}`);
            }
          }
          
          // 직접 파일 링크 (href가 실제 파일인 경우만)
          if (href && href !== '#none' && /\.(pdf|hwp|hwpx|docx?|xlsx?)$/i.test(href)) {
            push(href);
          }
          
          // 다운로드 버튼이나 링크 텍스트로 판단 (href가 유효한 경우만)
          if (text && /다운로드|첨부|파일|download/i.test(text) && href && href !== '#none') {
            push(href);
          }
        });
      } else {
        console.log('No .fileBox found, trying general link search...');
        
        // fileBox가 없는 경우 일반적인 링크 검색
        $('a').each((_, a) => {
          const href = $(a).attr('href') || '';
          const onclick = $(a).attr('onclick') || '';
          const text = $(a).text().trim();
          
          // href가 #none인 경우는 건너뛰기
          if (href === '#none') {
            console.log(`Skipping #none link: ${onclick}`);
            return;
          }
          
          console.log(`Found link: href="${href}", onclick="${onclick}", text="${text}"`);
          
          const push = (link) => {
            const fullUrl = link.startsWith('http') ? link : new URL(link, 'https://www.hira.or.kr').href;
            if (!attachments.includes(fullUrl)) {
              attachments.push(fullUrl);
              console.log(`Added attachment: ${fullUrl}`);
            } else {
              console.log(`Skipped duplicate attachment: ${fullUrl}`);
            }
          };
          
          // fileDownloadBbsBltFile 함수 호출 패턴 (공고 게시판) - 더 정확한 정규식 사용
          if (/fileDownloadBbsBltFile/.test(onclick)) {
            let m = onclick.match(/fileDownloadBbsBltFile\s*\(\s*['"]([^'"]+)['"],\s*(\d+),\s*(\d+),\s*(\d+)\s*\)/);
            
            if (!m) {
              // 공백이 없는 패턴도 시도
              m = onclick.match(/fileDownloadBbsBltFile\s*\(\s*['"]([^'"]+)['"],\s*(\d+),\s*(\d+),\s*(\d+)\s*\)/);
            }
            
            if (m) {
              const [_, pgmid, brdBltNo, brdScnBltNo, fileSeq] = m;
              console.log(`fileDownloadBbsBltFile parameters: ${pgmid}, ${brdBltNo}, ${brdScnBltNo}, ${fileSeq}`);
              
              if (pgmid && brdBltNo && brdScnBltNo && fileSeq) {
                const downloadUrl = `/fileDownloadBbsBltFile.do?pgmid=${pgmid}&brdBltNo=${brdBltNo}&brdScnBltNo=${brdScnBltNo}&fileSeq=${fileSeq}`;
                push(downloadUrl);
              } else {
                console.warn(`Invalid fileDownloadBbsBltFile parameters: ${pgmid}, ${brdBltNo}, ${brdScnBltNo}, ${fileSeq}`);
              }
            } else {
              console.warn(`Failed to parse fileDownloadBbsBltFile function call: ${onclick}`);
            }
          }
          
          // 직접 파일 링크 (href가 실제 파일인 경우만)
          if (href && href !== '#none' && /\.(pdf|hwp|hwpx|docx?|xlsx?)$/i.test(href)) {
            push(href);
          }
          
          // 다운로드 버튼이나 링크 텍스트로 판단 (href가 유효한 경우만)
          if (text && /다운로드|첨부|파일|download/i.test(text) && href && href !== '#none') {
            push(href);
          }
        });
      }
    }

    console.log(`Found ${attachments.length} attachments`);

    // 첨부파일 다운로드 - 개선된 버전
    for (const url of attachments) {
      try {
        console.log(`Downloading attachment: ${url}`);
        
        // 세션 유지를 위한 쿠키 설정
        const cookieJar = new Map();
        
        // 먼저 메인 페이지 방문하여 세션 설정
        try {
          await axios.get('https://www.hira.or.kr/main.do', {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
          });
        } catch (e) {
          console.log('Main page visit failed, continuing...');
        }
        
        // 더 강력한 헤더 설정
        const res = await axios.get(url, { 
          responseType: 'arraybuffer',
          timeout: 30000, // 30초 타임아웃
          maxRedirects: 5, // 리다이렉트 허용
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': 'https://www.hira.or.kr/bbsDummy.do?pgmid=HIRAA030023030000',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
            'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'same-origin',
            'Cache-Control': 'max-age=0'
          }
        });
        
        // 응답 상태 확인
        if (res.status !== 200) {
          console.warn(`Download failed with status ${res.status}: ${url}`);
          continue;
        }
        
        // Content-Type 확인
        const contentType = res.headers['content-type'] || '';
        console.log(`Content-Type: ${contentType}`);
        
        // 파일 크기 확인
        const contentLength = res.headers['content-length'];
        if (contentLength && parseInt(contentLength) < 100) {
          console.warn(`File too small (${contentLength} bytes), might be error page: ${url}`);
          continue;
        }
        
        // 파일명 추출 - 더 정확한 방법
        let fname = '';
        const cd = res.headers['content-disposition'] || '';
        
        if (cd) {
          // UTF-8 인코딩된 파일명
          let nameMatch = cd.match(/filename\*=utf-8''([^;]+)/);
          if (nameMatch) {
            fname = decodeURIComponent(nameMatch[1]);
          } else {
            // 일반 파일명
            nameMatch = cd.match(/filename="?([^";]+)/);
            if (nameMatch) {
              fname = nameMatch[1];
            }
          }
        }
        
        // 파일명이 없으면 URL에서 추출
        if (!fname) {
          const urlPath = url.split('?')[0];
          fname = path.basename(urlPath);
        }
        
        // 파일명이 여전히 없거나 이상한 경우 기본값 사용
        if (!fname || fname.length < 3 || fname === 'none' || fname === '#none') {
          const timestamp = Date.now();
          let ext = 'bin';
          
          // Content-Type에서 확장자 추정
          if (contentType.includes('pdf')) ext = 'pdf';
          else if (contentType.includes('hwp') || contentType.includes('application/x-hwp')) ext = 'hwp';
          else if (contentType.includes('excel') || contentType.includes('spreadsheet')) ext = 'xlsx';
          else if (contentType.includes('word') || contentType.includes('document')) ext = 'docx';
          else if (contentType.includes('text')) ext = 'txt';
          
          fname = `attachment_${timestamp}.${ext}`;
        }
        
        // 파일명 정리 (특수문자 제거)
        fname = fname.replace(/[<>:"/\\|?*]/g, '_');
        
        const filePath = path.join(RAW_DIR, fname);
        fs.writeFileSync(filePath, res.data);
        
        post.attachments = post.attachments || [];
        post.attachments.push(filePath);
        console.log(`✅ Downloaded: ${filePath} (${res.data.length} bytes)`);
        
      } catch (e) { 
        console.warn(`❌ Attachment download failed: ${url}, error: ${e.message}`);
        
        // 에러 상세 정보 출력
        if (e.response) {
          console.warn(`  Status: ${e.response.status}`);
          console.warn(`  Headers:`, e.response.headers);
        }
      }
    }
    
    post.textFile = textFile;
    return post;
    
  } catch (error) {
    console.error(`Error fetching post ${post.postNo}:`, error.message);
    return post;
  }
}

// --------------------------- 2. DOCUMENT CREATION ----------------------------
async function extractText(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  
  if (ext === '.pdf') {
    try {
      // Dynamically import pdf-parse for ESM compatibility
      const pdfParseModule = await import('pdf-parse');
      const pdfParse = pdfParseModule.default;
      return (await pdfParse(fs.readFileSync(filePath))).text;
    } catch (error) {
      console.warn(`PDF 처리 실패: ${filePath}, 오류: ${error.message}`);
      return "";
    }
  }
  
  if (ext === '.hwp' || ext === '.hwpx') {
    // 1단계: hwp.js 시도
    try {
      console.log(`hwp.js로 HWP 파일 처리 시도: ${filePath}`);
      const hwp = new HWP(filePath);
      const text = await hwp.getText(); // hwp.js는 async일 수 있음
      if (text && text.trim().length > 0) {
        console.log(`hwp.js 성공: ${text.length}자 추출`);
        return text;
      } else {
        throw new Error('hwp.js에서 빈 텍스트 반환');
      }
    } catch (hwpError) {
      console.warn(`hwp.js 실패: ${hwpError.message}, textract으로 fallback 시도`);
      
      // 2단계: textract fallback
      try {
        const text = await new Promise((resolve, reject) => {
          textract.fromFileWithPath(filePath, (err, text) => {
            if (err) reject(err);
            else resolve(text || "");
          });
        });
        
        if (text && text.trim().length > 0) {
          console.log(`textract 성공: ${text.length}자 추출`);
          return text;
        } else {
          throw new Error('textract에서 빈 텍스트 반환');
        }
      } catch (textractError) {
        console.warn(`textract도 실패: ${textractError.message}`);
        
        // 3단계: 수동 변환 안내
        const pdfPath = filePath.replace(/\.hwpx?$/i, '.pdf');
        console.warn(`HWP 파일 처리 실패: ${path.basename(filePath)}`);
        console.warn(`해결 방법:`);
        console.warn(`1. 한글에서 "${path.basename(pdfPath)}"로 PDF 저장`);
        console.warn(`2. ${path.dirname(filePath)} 폴더에 PDF 파일 추가`);
        console.warn(`3. 다시 동기화 실행`);
        
        return ""; // 빈 문자열 반환 (전체 프로세스 중단 방지)
      }
    }
  }
  
  if (ext === '.txt') {
    try {
      return fs.readFileSync(filePath, 'utf-8');
    } catch (error) {
      console.warn(`텍스트 파일 처리 실패: ${filePath}, 오류: ${error.message}`);
      return "";
    }
  }
  
  // 기타 문서 형식 (DOC, DOCX 등)
  try {
    const text = await new Promise((resolve, reject) => {
      textract.fromFileWithPath(filePath, (err, text) => {
        if (err) reject(err);
        else resolve(text || "");
      });
    });
    return text;
  } catch (error) {
    console.warn(`파일 처리 실패: ${filePath}, 오류: ${error.message}`);
    return "";
  }
}

// Helper function to identify and parse document structure
function identifySection(text) {
  // First, analyze indentation
  const indentMatch = text.match(/^(\s+)/);
  const indentLevel = indentMatch ? Math.floor(indentMatch[0].length / 2) : 0; // 2spaces = 1 level

  // Common patterns for headers in Korean documents
  const headerPatterns = [
    // 대제목: 1., 2., 3. ...
    { pattern: /^[\s]*\d+\.\s+/, level: 1, type: 'numeric' },
    // 중제목: 가., 나., 다. ...
    { pattern: /^[\s]*[가-힣]\.\s+/, level: 2, type: 'korean' },
    // 소제목: 1), 2), 3) ...
    { pattern: /^[\s]*\d+\)\s+/, level: 3, type: 'numericParen' },
    // 세부항목: (1), (2), (3) ...
    { pattern: /^[\s]*\(\d+\)\s+/, level: 4, type: 'parenNumeric' },
    // 기타 항목: -, •
    { pattern: /^[\s]*[-•]\s+/, level: 5, type: 'bullet' }
  ];

  // Find the matching pattern
  for (const { pattern, level, type } of headerPatterns) {
    if (pattern.test(text)) {
      const match = text.match(pattern)[0];
      return {
        isHeader: true,
        level: Math.min(level + indentLevel, 5), // Consider both pattern level and indentation
        type,
        indentLevel,
        headerText: match.trim(),
        content: text.slice(match.length).trim(),
        rawText: text  // Keep original text with indentation
      };
    }
  }

  // Check for potential headers based on indentation and text properties
  const cleanText = text.trim();
  const isShortLine = cleanText.length <= 50;  // Potential header if line is short
  const endsWithColon = cleanText.endsWith(':');  // Often indicates a header
  const hasNoEndPunct = !/[.!?]$/.test(cleanText);  // Headers often don't end with punctuation
  
  // If line is indented and looks like a header, treat it as one
  if (indentLevel > 0 && isShortLine && (endsWithColon || hasNoEndPunct)) {
    return {
      isHeader: true,
      level: Math.min(indentLevel + 2, 5),  // Convert indent to level, but cap at 5
      type: 'indent',
      indentLevel,
      headerText: cleanText,
      content: '',
      rawText: text
    };
  }

  return {
    isHeader: false,
    level: 0,
    type: 'content',
    indentLevel,
    content: cleanText,
    rawText: text
  };
}

// Helper function to detect and parse tables
function detectTable(lines, startIdx) {
  // Common table border patterns
  const borderPatterns = [
    /^\s*[+\-=│┌┐└┘├┤─│]{3,}\s*$/, // ASCII and Unicode box drawing
    /^\s*[\|┃]\s*[-=]{3,}\s*[\|┃]/, // Markdown-style tables
    /^[\s│┃]*[─━═]{3,}[\s│┃]*$/    // Horizontal lines
  ];

  // Check if line might be a table border
  const isBorder = (line) => borderPatterns.some(pattern => pattern.test(line));
  
  // Check if line might be table content (contains multiple whitespace-separated columns or |)
  const isTableRow = (line) => {
    const trimmed = line.trim();
    return (
      (trimmed.includes('|') || trimmed.includes('│') || trimmed.includes('┃')) ||
      (/\s{3,}/.test(trimmed) && trimmed.split(/\s{3,}/).length >= 2)
    );
  };

  // If current line isn't a table border or content, not a table
  if (!isBorder(lines[startIdx]) && !isTableRow(lines[startIdx])) {
    return null;
  }

  let tableLines = [];
  let i = startIdx;
  let foundHeader = false;
  let columnCount = 0;

  // Scan forward to collect all table lines
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    
    // Skip empty lines within reason
    if (!trimmed) {
      if (tableLines.length > 0 && i < lines.length - 1 && 
          (isBorder(lines[i + 1]) || isTableRow(lines[i + 1]))) {
        i++;
        continue;
      }
      break;
    }

    if (isBorder(line)) {
      foundHeader = true;
      tableLines.push({ type: 'border', content: line });
    } else if (isTableRow(line)) {
      // Parse columns, either by | or by whitespace alignment
      let columns;
      if (line.includes('|') || line.includes('│') || line.includes('┃')) {
        columns = line.split(/[|│┃]/).map(col => col.trim()).filter(Boolean);
      } else {
        columns = line.trim().split(/\s{3,}/).map(col => col.trim());
      }

      if (!columnCount) {
        columnCount = columns.length;
      } else if (columns.length < columnCount * 0.5) {
        // If column count drops significantly, probably not part of table
        break;
      }

      tableLines.push({ type: 'row', columns });
    } else {
      break;
    }
    i++;
  }

  // Require at least 2 rows (header + data) or 3 lines total
  if (tableLines.length < 2 || (tableLines.length < 3 && !foundHeader)) {
    return null;
  }

  return {
    lines: tableLines,
    endIdx: i - 1,
    columnCount
  };
}

// Helper function to analyze table headers semantically
function analyzeTableHeaders(headers) {
  // Common patterns in medical/drug-related tables
  const headerPatterns = {
    drugName: {
      patterns: [
        /^(약\s*품\s*명|성\s*분|제\s*품|항\s*암\s*제|약\s*제|성분명|일반명|제품명)$/,
        /(drug|medicine|compound|substance)/i
      ],
      type: 'drugName'
    },
    dosage: {
      patterns: [
        /^(용\s*량|투\s*여\s*량|투여용량|용법|투여법|투약량)$/,
        /(dosage|dose|amount)/i
      ],
      type: 'dosage'
    },
    frequency: {
      patterns: [
        /^(투\s*여\s*주\s*기|주\s*기|빈\s*도|투여간격|간격)$/,
        /(frequency|interval|cycle|period)/i
      ],
      type: 'frequency'
    },
    duration: {
      patterns: [
        /^(투\s*여\s*기\s*간|기\s*간|치료기간|투여일수)$/,
        /(duration|period|term|length)/i
      ],
      type: 'duration'
    },
    indication: {
      patterns: [
        /^(적\s*응\s*증|대\s*상|투여대상|적용대상|급여대상)$/,
        /(indication|target|subject)/i
      ],
      type: 'indication'
    },
    sideEffect: {
      patterns: [
        /^(부\s*작\s*용|이상반응|독성|반응|부반응)$/,
        /(side\s*effect|toxicity|adverse|reaction)/i
      ],
      type: 'sideEffect'
    },
    insurance: {
      patterns: [
        /^(급\s*여\s*기\s*준|급여|보험|수가|인정기준)$/,
        /(insurance|coverage|criteria)/i
      ],
      type: 'insurance'
    },
    cost: {
      patterns: [
        /^(비\s*용|가\s*격|약가|원|금액)$/,
        /(cost|price|amount)/i
      ],
      type: 'cost'
    }
  };

  // Analyze each header
  return headers.map(header => {
    const trimmed = header.trim();
    for (const [category, {patterns, type}] of Object.entries(headerPatterns)) {
      if (patterns.some(pattern => pattern.test(trimmed))) {
        return { original: header, type, category };
      }
    }
    return { original: header, type: 'unknown', category: 'other' };
  });
}

// Helper function to analyze table content based on column types
function analyzeTableContent(columns, columnTypes) {
  const analyzed = {};
  
  columns.forEach((value, index) => {
    const type = columnTypes[index]?.type;
    if (!type || type === 'unknown') return;

    // Clean and normalize the value
    let normalizedValue = value.trim();
    
    switch(type) {
      case 'drugName':
        // Store drug names in a normalized format
        analyzed.drugName = normalizedValue.replace(/\s+/g, ' ');
        break;
        
      case 'dosage':
        // Extract numeric values and units
        const dosageMatch = normalizedValue.match(/(\d+(?:\.\d+)?)\s*(mg|g|ml|l|mcg|µg|unit|IU|m2)/i);
        if (dosageMatch) {
          analyzed.dosage = {
            value: parseFloat(dosageMatch[1]),
            unit: dosageMatch[2].toLowerCase(),
            original: normalizedValue
          };
        }
        break;
        
      case 'frequency':
        // Normalize frequency expressions
        analyzed.frequency = {
          original: normalizedValue,
          normalized: normalizedValue
            .replace(/매\s*일/g, 'daily')
            .replace(/매\s*주/g, 'weekly')
            .replace(/매\s*월/g, 'monthly')
            .replace(/\d+\s*회/g, match => match.replace('회', ' times'))
        };
        break;
        
      case 'duration':
        // Extract duration values
        const durationMatch = normalizedValue.match(/(\d+)\s*(일|주|개월|달|년)/);
        if (durationMatch) {
          analyzed.duration = {
            value: parseInt(durationMatch[1]),
            unit: durationMatch[2],
            original: normalizedValue
          };
        }
        break;
        
      case 'cost':
        // Extract and normalize cost values
        const costMatch = normalizedValue.match(/(\d+(?:,\d{3})*(?:\.\d+)?)\s*(원|만원|억원)/);
        if (costMatch) {
          analyzed.cost = {
            value: parseFloat(costMatch[1].replace(/,/g, '')),
            unit: costMatch[2],
            original: normalizedValue
          };
        }
        break;
        
      default:
        // Store other recognized types as is
        analyzed[type] = normalizedValue;
    }
  });
  
  return analyzed;
}

function tableToMarkdown(table) {
  if (!table || !table.lines || !table.lines.length) return '';

  // Get header row for analysis
  const headerRow = table.lines.find(line => line.type === 'row');
  if (!headerRow) return '';

  // Analyze headers semantically
  const columnTypes = analyzeTableHeaders(headerRow.columns);
  
  // Convert table to markdown format with semantic analysis
  let mdLines = [];
  let firstRow = true;
  let analyzedRows = [];

  table.lines.forEach(line => {
    if (line.type === 'row') {
      mdLines.push(`| ${line.columns.join(' | ')} |`);
      
      // Add semantic analysis for data rows
      if (!firstRow) {
        const analyzedContent = analyzeTableContent(line.columns, columnTypes);
        if (Object.keys(analyzedContent).length > 0) {
          analyzedRows.push(analyzedContent);
        }
      }
      
      if (firstRow) {
        mdLines.push(`|${' --- |'.repeat(line.columns.length)}`);
        firstRow = false;
      }
    }
  });

  return {
    markdown: mdLines.join('\n'),
    columnTypes,
    analyzedRows
  };
}

async function createDocumentsFromPdfOrHwp(filePath, baseMetadata) {
  try {
    const ext = path.extname(filePath).toLowerCase();
    let rawText = '';
    let lines = [];
    let pageLineMap = [];
    let isPdf = (ext === '.pdf');
    let pageCount = 1;

    if (isPdf) {
      // Use pdf-parse to get text by page
      const pdfData = await import('pdf-parse');
      const pdfParse = pdfData.default;
      const pdfResult = await pdfParse(fs.readFileSync(filePath));
      pageCount = pdfResult.numpages;
      // pdfData.textInPages: array of text per page (if available)
      if (pdfResult.textInPages && Array.isArray(pdfResult.textInPages)) {
        let lineIdx = 0;
        pdfResult.textInPages.forEach((pageText, pageIdx) => {
          const pageLines = pageText.split(/\r?\n/).filter(line => line.trim());
          pageLines.forEach(() => pageLineMap.push(pageIdx + 1));
          lineIdx += pageLines.length;
        });
        lines = pdfResult.textInPages.flatMap(pageText => pageText.split(/\r?\n/).filter(line => line.trim()));
      } else {
        // Fallback: treat as single text
        rawText = pdfResult.text;
        lines = rawText.split(/\r?\n/).filter(line => line.trim());
        // No page info, default to 1
        pageLineMap = Array(lines.length).fill(1);
      }
    } else {
      // HWP or HWPX: fallback to previous logic
      rawText = await extractText(filePath);
      lines = rawText.split(/\r?\n/).filter(line => line.trim());
      // No page info, default to 1
      pageLineMap = Array(lines.length).fill(1);
    }

    if (!lines.length) return [];

    const documents = [];
    let currentSection = {
      title: '',
      level: 0,
      type: '',
      indentLevel: 0,
      content: [],
      tables: [],  // Add tables array
      pageNum: 1,
      rawLines: []  // Keep original formatting
    };
    let lastPageNum = 1;
    let prevIndentLevel = 0;  // Track previous indent for context

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Check for table
      const table = detectTable(lines, i);
      if (table) {
        // Convert table to markdown and analyze content
        const tableData = tableToMarkdown(table);
        if (tableData && tableData.markdown) {
          currentSection.tables.push({
            content: tableData.markdown,
            columnTypes: tableData.columnTypes,
            analyzedRows: tableData.analyzedRows,
            lineIndex: i,
            pageNumber: pageLineMap[i] || lastPageNum
          });
          
          // Skip the lines we processed as table
          i = table.endIdx;
          continue;
        }
      }

      const section = identifySection(line);
      const pageNum = pageLineMap[i] || 1;

      // Detect if this might be a continuation of previous section
      const isContinuation = section.indentLevel > prevIndentLevel && 
                            !section.isHeader && 
                            currentSection.content.length > 0;

      // If this is a header (or significant indent change) and we have content, save current section
      if ((section.isHeader || (section.indentLevel < prevIndentLevel && !isContinuation)) && 
          (currentSection.content.length > 0 || currentSection.tables.length > 0)) {
        
        let pageContent = currentSection.title;
        if (currentSection.content.length > 0) {
          pageContent += '\n' + currentSection.content.join('\n');
        }
        
        // Add tables to content
        if (currentSection.tables.length > 0) {
          currentSection.tables.forEach(table => {
            pageContent += '\n\n' + table.content;
          });
        }

        documents.push(new Document({
          pageContent,
          metadata: {
            ...baseMetadata,
            sectionTitle: currentSection.title,
            sectionLevel: currentSection.level,
            sectionType: currentSection.type,
            indentLevel: currentSection.indentLevel,
            pageNumber: lastPageNum,
            isStructured: true,
            hasTables: currentSection.tables.length > 0,
            tableCount: currentSection.tables.length,
            tables: currentSection.tables.map(table => ({
              ...table,
              hasAnalyzedContent: table.analyzedRows && table.analyzedRows.length > 0,
              columnTypes: table.columnTypes
            })),
            rawText: currentSection.rawLines.join('\n')  // Preserve original formatting
          }
        }));

        // Reset current section
        currentSection.content = [];
        currentSection.tables = [];
        currentSection.rawLines = [];
      }

      // Update current section
      if (section.isHeader) {
        currentSection.title = `${section.headerText}${section.content}`;
        currentSection.level = section.level;
        currentSection.type = section.type;
        currentSection.indentLevel = section.indentLevel;
        lastPageNum = pageNum;
      } else {
        currentSection.content.push(section.content);
      }
      currentSection.rawLines.push(section.rawText);
      prevIndentLevel = section.indentLevel;
    }

    // Don't forget to save the last section
    if (currentSection.content.length > 0 || currentSection.tables.length > 0) {
      let pageContent = currentSection.title;
      if (currentSection.content.length > 0) {
        pageContent += '\n' + currentSection.content.join('\n');
      }
      
      // Add tables to content
      if (currentSection.tables.length > 0) {
        currentSection.tables.forEach(table => {
          pageContent += '\n\n' + table.content;
        });
      }

      documents.push(new Document({
        pageContent,
        metadata: {
          ...baseMetadata,
          sectionTitle: currentSection.title,
          sectionLevel: currentSection.level,
          sectionType: currentSection.type,
          indentLevel: currentSection.indentLevel,
          pageNumber: lastPageNum,
          isStructured: true,
          hasTables: currentSection.tables.length > 0,
          tableCount: currentSection.tables.length,
          tables: currentSection.tables.map(table => ({
            ...table,
            hasAnalyzedContent: table.analyzedRows && table.analyzedRows.length > 0,
            columnTypes: table.columnTypes
          })),
          rawText: currentSection.rawLines.join('\n')
        }
      }));
    }

    const totalTables = documents.reduce((sum, doc) => sum + (doc.metadata.tableCount || 0), 0);
    console.log(`${path.basename(filePath)} processed → ${documents.length} sections identified, ${totalTables} tables found.`);
    return documents;

  } catch (error) {
    console.warn(`구조화 처리 실패: ${filePath}, 오류: ${error.message}`);
    // Fallback to basic text splitting if structure analysis fails
    const rawText = await extractText(filePath);
    return createDocumentsFromText(rawText, { ...baseMetadata, isStructured: false });
  }
}

async function createDocumentsFromExcel(filePath, baseMetadata) {
  try {
    const workbook = xlsx.readFile(filePath);
    const documents = [];
    workbook.SheetNames.forEach((sheetName, sheetIndex) => {
      const sheet = workbook.Sheets[sheetName];
      const rows = xlsx.utils.sheet_to_json(sheet);

      rows.forEach((row, rowIndex) => {
        const pageContent = Object.entries(row)
          .map(([key, value]) => `${key}: ${value}`)
          .join('\n');
        
        const metadata = {
          ...baseMetadata,
          sheetName,
          rowNumber: rowIndex + 2, // sheet_to_json default header is 1st row, so data starts from 2.
          ...row,
        };
        documents.push(new Document({ pageContent, metadata }));
      });
    });
    console.log(`Excel file ${path.basename(filePath)} processed → ${documents.length} documents (rows).`);
    return documents;
  } catch (error) {
    console.warn(`Excel 파일 처리 실패: ${filePath}, 오류: ${error.message}`);
    return [];
  }
}

async function upsertDocs(docs) {
  console.log(`Skipping vector store for now, just saving ${docs.length} documents to JSON`);
  
  // 임시로 벡터 저장소 대신 JSON 파일로 저장
  const storePath = path.join(VECTOR_DIR, 'hira');
  fs.mkdirSync(storePath, { recursive: true });
  
  const storeFile = path.join(storePath, 'documents.json');
  
  // 기존 문서 로드
  let existingDocs = [];
  if (fs.existsSync(storeFile)) {
    try {
      existingDocs = JSON.parse(fs.readFileSync(storeFile, 'utf-8'));
    } catch (error) {
      console.warn('Failed to load existing documents:', error.message);
    }
  }
  
  // 새 문서에 소스 추적 정보 추가
  const docsWithSources = docs.map(doc => ({
    ...doc,
    sourceInfo: {
      boardId: doc.metadata.boardId,
      postNo: doc.metadata.postNo,
      source: doc.metadata.source,
      filePath: doc.metadata.filePath,
      sectionTitle: doc.metadata.sectionTitle,
      pageNumber: doc.metadata.pageNumber,
      confidence: 1.0, // 기본 신뢰도
      timestamp: new Date().toISOString()
    }
  }));
  
  // 새 문서 추가
  const allDocs = [...existingDocs, ...docsWithSources];
  fs.writeFileSync(storeFile, JSON.stringify(allDocs, null, 2));
  
  console.log(`Saved ${allDocs.length} total documents to ${storeFile}`);
}

// --------------------------- 4. SYNC PIPELINE --------------------------------
async function processBoard(boardId, limit, force = false) {
  const registry = loadRegistry();
  let added = 0, newDetected = false;
  const posts = await fetchBoard(boardId, limit);
  
  console.log(`Processing ${posts.length} posts for board ${boardId} (force: ${force})`);
  
  for (const p of posts) {
    const processed = registry[boardId]?.includes(p.postNo);
    if (processed && !force) { 
      console.log(`Skip #${p.postNo} (${boardId}) - already processed`); 
      continue; 
    }
    
    console.log(`Processing new post #${p.postNo} (${boardId}): "${p.title}"`);
    
    const post = await fetchPost(p);
    const docs = [];

    // Process body text from post
    const bodyText = fs.readFileSync(post.textFile, 'utf-8');
    docs.push(...(await createDocumentsFromText(bodyText, { source: 'body', boardId, postNo: post.postNo, filePath: post.textFile })));

    // Process attachments, using the appropriate document creator
    for (const f of post.attachments || []) {
      const ext = path.extname(f).toLowerCase();
      const fileMetadata = {
        source: path.basename(f),
        boardId,
        postNo: post.postNo,
        filePath: f,
        fileUrl: `/files/${path.basename(f)}`
      };
      let attachmentDocs = [];

      if (ext === '.xlsx' || ext === '.xls') {
        attachmentDocs = await createDocumentsFromExcel(f, fileMetadata);
      } else if (ext === '.pdf' || ext === '.hwp' || ext === '.hwpx') {
        attachmentDocs = await createDocumentsFromPdfOrHwp(f, fileMetadata);
      } else {
        const textContent = await extractText(f);
        if (textContent && textContent.trim().length > 0) {
          attachmentDocs = await createDocumentsFromText(textContent, fileMetadata);
        }
      }
      docs.push(...attachmentDocs);
    }

    if (docs.length > 0) {
      await upsertDocs(docs);
      added += docs.length;
      registry[boardId] = registry[boardId] || [];
      if (!registry[boardId].includes(post.postNo)) registry[boardId].push(post.postNo);
      newDetected = true;
      console.log(`Post #${post.postNo} (${boardId}) processed → ${docs.length} chunks/rows.`);
    } else {
      console.log(`Post #${post.postNo} (${boardId}) processed → 0 chunks. Nothing to add.`);
    }
  }
  saveRegistry(registry);
  return { added, newDetected };
}

async function sync(force = false) {
  console.log(`Starting sync process (force: ${force})...`);
  
  const resultA = await processBoard(BOARD_A, 3, force);
  console.log(`Board A result: ${resultA.added} chunks added, new detected: ${resultA.newDetected}`);
  
  // If board A had a new post, board B must be refreshed regardless of change.
  const forceB = force || resultA.newDetected;
  const resultB = await processBoard(BOARD_B, 3, forceB);
  console.log(`Board B result: ${resultB.added} chunks added, new detected: ${resultB.newDetected}`);
  
  const total = resultA.added + resultB.added;
  console.log(`Sync completed. Total: ${total} chunks added (A:${resultA.added}, B:${resultB.added})`);
  
  if (total > 0) {
    console.log('✅ New content has been added to the database');
  } else {
    console.log('ℹ️ No new content found');
  }
}

// --------------------------- 5. QUERY & SOURCE TRACKING ----------------------------------------
async function searchWithSources(query, limit = 5) {
  const storePath = path.join(VECTOR_DIR, 'hira');
  const storeFile = path.join(storePath, 'documents.json');
  
  if (!fs.existsSync(storeFile)) { 
    console.error('Documents not found — run --sync first'); 
    return { results: [], sources: [] }; 
  }
  
  try {
    const documents = JSON.parse(fs.readFileSync(storeFile, 'utf-8'));
    
    // 간단한 키워드 검색 (나중에 벡터 검색으로 개선)
    const results = [];
    const sources = new Map();
    
    documents.forEach((doc, index) => {
      const content = doc.pageContent || '';
      const queryLower = query.toLowerCase();
      const contentLower = content.toLowerCase();
      
      if (contentLower.includes(queryLower)) {
        const score = calculateRelevanceScore(queryLower, contentLower);
        results.push({
          content: doc.pageContent,
          score: score,
          sourceInfo: doc.sourceInfo,
          metadata: doc.metadata
        });
        
        // 소스 정보 수집
        const sourceKey = `${doc.sourceInfo.boardId}_${doc.sourceInfo.postNo}`;
        if (!sources.has(sourceKey)) {
          sources.set(sourceKey, {
            boardId: doc.sourceInfo.boardId,
            postNo: doc.sourceInfo.postNo,
            source: doc.sourceInfo.source,
            filePath: doc.sourceInfo.filePath,
            sectionTitle: doc.sourceInfo.sectionTitle,
            confidence: doc.sourceInfo.confidence,
            timestamp: doc.sourceInfo.timestamp
          });
        }
      }
    });
    
    // 점수순으로 정렬하고 상위 결과만 반환
    results.sort((a, b) => b.score - a.score);
    const topResults = results.slice(0, limit);
    
    return {
      results: topResults,
      sources: Array.from(sources.values())
    };
    
  } catch (error) {
    console.error('Error searching documents:', error.message);
    return { results: [], sources: [] };
  }
}

function calculateRelevanceScore(query, content) {
  // 간단한 관련성 점수 계산
  const queryWords = query.split(/\s+/);
  let score = 0;
  
  queryWords.forEach(word => {
    const matches = (content.match(new RegExp(word, 'gi')) || []).length;
    score += matches;
  });
  
  return score;
}

async function query(q) {
  const { results, sources } = await searchWithSources(q, 5);
  
  console.log(`\n🔍 검색 결과: "${q}"`);
  console.log(`📊 총 ${results.length}개 결과, ${sources.length}개 소스`);
  
  results.forEach((r, i) => {
    const source = r.sourceInfo;
    console.log(`\n[${i + 1}] 점수: ${r.score.toFixed(2)}`);
    console.log(`📄 소스: ${source.source} (게시글 #${source.postNo})`);
    console.log(`📁 파일: ${source.filePath || '본문'}`);
    if (source.sectionTitle) {
      console.log(`📑 섹션: ${source.sectionTitle}`);
    }
    console.log(`💬 내용: ${r.content.slice(0, 200)}…`);
  });
  
  console.log(`\n📚 참고 소스:`);
  sources.forEach((source, i) => {
    console.log(`  ${i + 1}. ${source.source} (게시글 #${source.postNo})`);
  });
}

// --------------------------- 6. CRON -----------------------------------------
if (!process.env.DISABLE_CRON) {
  cron.schedule(DAILY_CRON_KST, () => sync().catch((e) => console.error('[CRON] fail', e)), { timezone: 'Asia/Seoul' });
  console.log(`Cron registered ${DAILY_CRON_KST} KST`);
}

// --------------------------- 7. CLI ------------------------------------------
const argv = minimist(process.argv.slice(2));
(async () => {
  if (argv.sync) await sync(argv.force === true);
  if (argv.query) await query(argv.query);
})();

export { sync, query, searchWithSources, VECTOR_DIR };

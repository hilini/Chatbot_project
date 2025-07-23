import axios from 'axios';
import fs from 'fs';
import path from 'path';
import * as cheerio from 'cheerio';
import iconv from 'iconv-lite';
import XLSX from 'xlsx';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class EnhancedHiraCrawler {
    constructor() {
        this.baseUrl = 'https://www.hira.or.kr';
        this.rawDir = path.join(__dirname, '../data/raw');
        this.textDir = path.join(__dirname, '../data/text');
        
        // 디렉토리 생성
        [this.rawDir, this.textDir].forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        });
    }

    // 1. 게시판 목록 크롤링
    async fetchBoardList(boardId, limit = 5) {
        console.log(`Fetching board list for ${boardId}...`);
        
        const url = `${this.baseUrl}/bbsDummy.do?pgmid=${boardId}`;
        
        try {
            const response = await axios.get(url, {
                responseType: 'arraybuffer',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });
            
            const decodedData = iconv.decode(response.data, 'utf-8');
            const $ = cheerio.load(decodedData);
            
            const posts = [];
            
            // 게시글 목록 추출
            $('table tbody tr').each((_, tr) => {
                const tds = $(tr).find('td');
                if (tds.length >= 3) {
                    const postNo = tds.eq(0).text().trim();
                    const title = tds.eq(1).text().trim();
                    const hasAttachment = tds.eq(2).find('a').length > 0;
                    
                    // 게시글 링크에서 brdBltNo 추출
                    const detailLink = tds.eq(2).find('a').attr('href') || ''; // 제목이 있는 3번째 셀
                    let brdBltNo = postNo;
                    
                    if (detailLink) {
                        const match = detailLink.match(/brdBltNo=(\d+)/);
                        if (match) {
                            brdBltNo = match[1];
                            console.log(`Extracted brdBltNo: ${brdBltNo} for post ${postNo}`);
                        }
                    }
                    
                    if (postNo && title) {
                        posts.push({
                            postNo,
                            title,
                            hasAttachment,
                            brdBltNo,
                            detailUrl: `${this.baseUrl}/bbsDummy.do?pgmid=${boardId}&brdScnBltNo=4&brdBltNo=${brdBltNo}&pageIndex=1&pageIndex2=1`
                        });
                    }
                }
            });
            
            console.log(`Found ${posts.length} posts`);
            return posts.slice(0, limit);
            
        } catch (error) {
            console.error('Board list fetch failed:', error.message);
            return [];
        }
    }

    // 2. 게시글 상세 내용 크롤링
    async fetchPostDetail(post) {
        console.log(`Fetching post detail: ${post.title}`);
        
        try {
            const response = await axios.get(post.detailUrl, {
                responseType: 'arraybuffer',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });
            
            const decodedData = iconv.decode(response.data, 'utf-8');
            const $ = cheerio.load(decodedData);
            
            // 본문 텍스트 추출 - <div class="view"> 안의 <p> 태그 내용
            let bodyText = '';
            const viewDiv = $('.view');
            if (viewDiv.length > 0) {
                const paragraphs = viewDiv.find('p');
                if (paragraphs.length > 0) {
                    // 의미있는 텍스트만 필터링 (빈 줄, 메뉴 등 제거)
                    const meaningfulParagraphs = paragraphs.map((_, p) => {
                        const text = $(p).text().trim();
                        // 의미있는 텍스트인지 확인 (길이, 메뉴 텍스트 제외)
                        if (text.length > 5 && 
                            !text.includes('홈') && 
                            !text.includes('제도·정책') && 
                            !text.includes('약제기준정보') &&
                            !text.includes('암질환') &&
                            !text.includes('공고') &&
                            !text.includes('매우 만족') &&
                            !text.includes('담당부서') &&
                            !text.includes('문의전화')) {
                            return text;
                        }
                        return null;
                    }).get().filter(text => text !== null);
                    
                    bodyText = meaningfulParagraphs.join('\n\n');
                    console.log(`Found ${meaningfulParagraphs.length} meaningful paragraphs in .view div`);
                } else {
                    // p 태그가 없으면 div.view의 전체 텍스트에서 의미있는 부분만 추출
                    const allText = viewDiv.text();
                    const lines = allText.split('\n')
                        .map(line => line.trim())
                        .filter(line => line.length > 10 && 
                            !line.includes('홈') && 
                            !line.includes('제도·정책') && 
                            !line.includes('약제기준정보') &&
                            !line.includes('암질환') &&
                            !line.includes('공고') &&
                            !line.includes('매우 만족') &&
                            !line.includes('담당부서') &&
                            !line.includes('문의전화') &&
                            !line.includes('Navi.contact'));
                    bodyText = lines.join('\n');
                    console.log('No p tags found, extracted meaningful text from .view div');
                }
            }
            
            // 본문이 없으면 다른 선택자들 시도
            if (!bodyText || bodyText.length < 50) {
                console.log('Body text too short, trying alternative selectors...');
                const altSelectors = ['.board_view', '.content', '.text', 'table', '.board_view_cont'];
                for (const selector of altSelectors) {
                    const altText = $(selector).text().trim();
                    if (altText.length > bodyText.length) {
                        console.log(`Alternative selector "${selector}" found ${altText.length} characters`);
                        bodyText = altText;
                    }
                }
            }
            
            // 텍스트 파일 저장
            const textFile = path.join(this.textDir, `${post.boardId}_${post.postNo}.txt`);
            fs.writeFileSync(textFile, bodyText);
            console.log(`Saved text: ${textFile} (${bodyText.length} chars)`);
            
            // 첨부파일 URL 추출
            const attachments = this.extractAttachmentUrls($, post);
            
            return {
                ...post,
                bodyText,
                attachments,
                textFile
            };
            
        } catch (error) {
            console.error('Post detail fetch failed:', error.message);
            return post;
        }
    }

    // 3. 첨부파일 URL 추출 (게시판별로 다르게 처리)
    extractAttachmentUrls($, post) {
        const attachments = [];
        
        // 공고 게시판: PDF 파일 2개만 다운로드
        if (post.boardId === 'HIRAA030023010000') {
            console.log('Processing announcement board - PDF files only');
            
            // 모든 링크에서 downLoadBbs 함수 호출 패턴 찾기
            $('a').each((_, a) => {
                const onclick = $(a).attr('onclick') || '';
                const text = $(a).text().trim();
                
                console.log(`Checking link: text="${text}", onclick="${onclick}"`);
                
                // PDF 파일만 처리 (apndNo=2, 4)
                if (/downLoadBbs/.test(onclick)) {
                    const match = onclick.match(/downLoadBbs\s*\(\s*['"]?([^'"]+)['"]?,\s*['"]?([^'"]+)['"]?,\s*['"]?([^'"]+)['"]?,\s*['"]?([^'"]+)['"]?\s*\)/);
                    if (match) {
                        const [_, param1, param2, param3, param4] = match;
                        console.log(`Found downLoadBbs: ${param1}, ${param2}, ${param3}, ${param4}`);
                        
                        // apndNo가 2 또는 4인 경우만 (PDF 파일)
                        if (param1 === '2' || param1 === '4') {
                            const downloadUrl = `${this.baseUrl}/bbs/bbsCDownLoad.do?apndNo=${param1}&apndBrdBltNo=${param2}&apndBrdTyNo=${param3}&apndBltNo=${param4}`;
                            attachments.push({
                                url: downloadUrl,
                                type: 'downLoadBbs',
                                params: { param1, param2, param3, param4 },
                                expectedName: param1 === '2' ? '주요공고개정내역' : '공고전문'
                            });
                            console.log(`Found PDF attachment: apndNo=${param1}, expectedName=${param1 === '2' ? '주요공고개정내역' : '공고전문'}`);
                        }
                    }
                }
            });
            
            // 첨부파일을 찾지 못한 경우, 게시글 번호를 기반으로 URL 생성 시도
            if (attachments.length === 0) {
                console.log('No attachments found in onclick, trying to generate URLs...');
                const brdBltNo = post.brdBltNo || post.postNo;
                
                // 주요공고개정내역 (apndNo=2)
                attachments.push({
                    url: `${this.baseUrl}/bbs/bbsCDownLoad.do?apndNo=2&apndBrdBltNo=${brdBltNo}&apndBrdTyNo=6&apndBltNo=49`,
                    type: 'downLoadBbs',
                    params: { param1: '2', param2: brdBltNo, param3: '6', param4: '49' },
                    expectedName: '주요공고개정내역'
                });
                
                // 공고전문 (apndNo=4)
                attachments.push({
                    url: `${this.baseUrl}/bbs/bbsCDownLoad.do?apndNo=4&apndBrdBltNo=${brdBltNo}&apndBrdTyNo=6&apndBltNo=49`,
                    type: 'downLoadBbs',
                    params: { param1: '4', param2: brdBltNo, param3: '6', param4: '49' },
                    expectedName: '공고전문'
                });
                
                console.log(`Generated URLs for post ${post.postNo} (brdBltNo: ${brdBltNo})`);
            }
        } else if (post.boardId === 'HIRAA030023030000') {
            // 항암화학요법 게시판: 엑셀과 한글 파일 다운로드
            console.log('Processing anticancer therapy board - Excel and HWP files');
            
            $('a').each((_, a) => {
                const href = $(a).attr('href') || '';
                const onclick = $(a).attr('onclick') || '';
                const text = $(a).text().trim();
                
                console.log(`Checking link: text="${text}", onclick="${onclick}"`);
                
                // downLoadBbs 함수 호출 패턴
                if (/downLoadBbs/.test(onclick)) {
                    const match = onclick.match(/downLoadBbs\s*\(\s*['"]?([^'"]+)['"]?,\s*['"]?([^'"]+)['"]?,\s*['"]?([^'"]+)['"]?,\s*['"]?([^'"]+)['"]?\s*\)/);
                    if (match) {
                        const [_, param1, param2, param3, param4] = match;
                        console.log(`Found downLoadBbs: ${param1}, ${param2}, ${param3}, ${param4}`);
                        
                        const downloadUrl = `${this.baseUrl}/bbs/bbsCDownLoad.do?apndNo=${param1}&apndBrdBltNo=${param2}&apndBrdTyNo=${param3}&apndBltNo=${param4}`;
                        
                        // 파일명 매핑 (param2 값에 따라)
                        let expectedName = '';
                        if (param2 === '8') {
                            expectedName = '허가초과 항암요법';
                        } else if (param2 === '7') {
                            expectedName = '항암화학요법 등 공고내용 전문';
                        }
                        
                        attachments.push({
                            url: downloadUrl,
                            type: 'downLoadBbs',
                            params: { param1, param2, param3, param4 },
                            expectedName
                        });
                        console.log(`Found attachment: apndNo=${param1}, apndBrdBltNo=${param2}, expectedName=${expectedName}`);
                    }
                }
                
                // fileDownloadBbsBltFile 함수 호출 패턴
                if (/fileDownloadBbsBltFile/.test(onclick)) {
                    const match = onclick.match(/fileDownloadBbsBltFile\s*\(\s*['"]?([^'"]+)['"]?,\s*(\d+),\s*(\d+),\s*(\d+)\s*\)/);
                    if (match) {
                        const [_, pgmid, brdBltNo, brdScnBltNo, fileSeq] = match;
                        const downloadUrl = `${this.baseUrl}/fileDownloadBbsBltFile.do?pgmid=${pgmid}&brdBltNo=${brdBltNo}&brdScnBltNo=${brdScnBltNo}&fileSeq=${fileSeq}`;
                        attachments.push({
                            url: downloadUrl,
                            type: 'fileDownloadBbsBltFile',
                            params: { pgmid, brdBltNo, brdScnBltNo, fileSeq }
                        });
                    }
                }
            });
        } else {
            // 기타 게시판: 모든 첨부파일 다운로드
            console.log('Processing other board - all attachments');
            
            $('a').each((_, a) => {
                const href = $(a).attr('href') || '';
                const onclick = $(a).attr('onclick') || '';
                const text = $(a).text().trim();
                
                // downLoadBbs 함수 호출 패턴
                if (/downLoadBbs/.test(onclick)) {
                    const match = onclick.match(/downLoadBbs\s*\(\s*['"]?([^'"]+)['"]?,\s*['"]?([^'"]+)['"]?,\s*['"]?([^'"]+)['"]?,\s*['"]?([^'"]+)['"]?\s*\)/);
                    if (match) {
                        const [_, param1, param2, param3, param4] = match;
                        const downloadUrl = `${this.baseUrl}/bbs/bbsCDownLoad.do?apndNo=${param1}&apndBrdBltNo=${param2}&apndBrdTyNo=${param3}&apndBltNo=${param4}`;
                        attachments.push({
                            url: downloadUrl,
                            type: 'downLoadBbs',
                            params: { param1, param2, param3, param4 }
                        });
                    }
                }
                
                // fileDownloadBbsBltFile 함수 호출 패턴
                if (/fileDownloadBbsBltFile/.test(onclick)) {
                    const match = onclick.match(/fileDownloadBbsBltFile\s*\(\s*['"]?([^'"]+)['"]?,\s*(\d+),\s*(\d+),\s*(\d+)\s*\)/);
                    if (match) {
                        const [_, pgmid, brdBltNo, brdScnBltNo, fileSeq] = match;
                        const downloadUrl = `${this.baseUrl}/fileDownloadBbsBltFile.do?pgmid=${pgmid}&brdBltNo=${brdBltNo}&brdScnBltNo=${brdScnBltNo}&fileSeq=${fileSeq}`;
                        attachments.push({
                            url: downloadUrl,
                            type: 'fileDownloadBbsBltFile',
                            params: { pgmid, brdBltNo, brdScnBltNo, fileSeq }
                        });
                    }
                }
            });
        }
        
        console.log(`Found ${attachments.length} attachments`);
        return attachments;
    }

    // 게시글 목록에서 첨부파일 URL 추출 (항암화학요법 게시판용)
    extractAttachmentUrlsFromList($, post) {
        const attachments = [];
        
        console.log(`Looking for attachments for post: "${post.title}"`);
        
        // 항암화학요법 게시판의 테이블 구조: 번호, 제목, 첨부 (3개 컬럼)
        $('.tb-type01.downType table tbody tr').each((_, tr) => {
            const tds = $(tr).find('td');
            if (tds.length >= 3) {
                const title = tds.eq(1).text().trim(); // 제목이 있는 2번째 셀
                console.log(`Checking row with title: "${title}"`);
                
                // 제목이 일치하거나 param2 값으로 매칭
                let shouldProcess = false;
                let param2 = '';
                
                if (title === post.title) {
                    shouldProcess = true;
                    console.log(`Found exact title match: "${title}"`);
                } else if (post.title === '허가초과 항암요법' && title.includes('허가초과')) {
                    shouldProcess = true;
                    param2 = '8';
                    console.log(`Found partial title match for 허가초과 항암요법`);
                } else if (post.title === '항암화학요법 등 공고내용 전문' && title.includes('항암화학요법')) {
                    shouldProcess = true;
                    param2 = '7';
                    console.log(`Found partial title match for 항암화학요법 등 공고내용 전문`);
                }
                
                if (shouldProcess) {
                    // 첨부파일 셀에서 다운로드 링크 찾기
                    const fileCell = tds.eq(2); // 첨부파일이 있는 3번째 셀
                    fileCell.find('a').each((_, a) => {
                        const onclick = $(a).attr('onclick') || '';
                        const text = $(a).text().trim();
                        
                        console.log(`Checking file link: text="${text}", onclick="${onclick}"`);
                        
                        if (/downLoadBbs/.test(onclick)) {
                            const match = onclick.match(/downLoadBbs\s*\(\s*['"]?([^'"]+)['"]?,\s*['"]?([^'"]+)['"]?,\s*['"]?([^'"]+)['"]?,\s*['"]?([^'"]+)['"]?\s*\)/);
                            if (match) {
                                const [_, param1, param2FromMatch, param3, param4] = match;
                                const actualParam2 = param2 || param2FromMatch;
                                console.log(`Found downLoadBbs: ${param1}, ${actualParam2}, ${param3}, ${param4}`);
                                
                                const downloadUrl = `${this.baseUrl}/bbs/bbsCDownLoad.do?apndNo=${param1}&apndBrdBltNo=${actualParam2}&apndBrdTyNo=${param3}&apndBltNo=${param4}`;
                                
                                // 파일명 매핑 (param2 값에 따라)
                                let expectedName = '';
                                if (actualParam2 === '8') {
                                    expectedName = '허가초과 항암요법';
                                } else if (actualParam2 === '7') {
                                    expectedName = '항암화학요법 등 공고내용 전문';
                                }
                                
                                attachments.push({
                                    url: downloadUrl,
                                    type: 'downLoadBbs',
                                    params: { param1, param2: actualParam2, param3, param4 },
                                    expectedName
                                });
                                console.log(`Found attachment: apndNo=${param1}, apndBrdBltNo=${actualParam2}, expectedName=${expectedName}`);
                            }
                        }
                    });
                }
            }
        });
        
        console.log(`Found ${attachments.length} attachments from list`);
        return attachments;
    }

    // 4. 파일 다운로드 (Content-Disposition 처리)
    async downloadFile(attachment, post) {
        try {
            console.log(`Downloading: ${attachment.url}`);
            
            const response = await axios.get(attachment.url, {
                responseType: 'arraybuffer',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Referer': post.detailUrl
                },
                timeout: 30000
            });
            
            // Content-Disposition에서 파일명 추출 및 처리
            let filename = `file_${Date.now()}.bin`;
            const contentDisposition = response.headers['content-disposition'];
            
            if (contentDisposition) {
                console.log(`Content-Disposition: ${contentDisposition}`);
                
                // UTF-8 인코딩된 파일명 (RFC 5987)
                let match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/);
                if (match) {
                    filename = decodeURIComponent(match[1]);
                } else {
                    // 일반 파일명 (RFC 6266)
                    match = contentDisposition.match(/filename="([^"]+)"/);
                    if (match) {
                        filename = match[1];
                    } else {
                        match = contentDisposition.match(/filename=([^;]+)/);
                        if (match) {
                            filename = match[1];
                        }
                    }
                }
                
                // 예상 파일명으로 교체 (attachment.expectedName이 있는 경우)
                if (attachment.expectedName) {
                    const dateMatch = filename.match(/(\d{8})/);
                    const date = dateMatch ? dateMatch[1] : '20250701';
                    const fileExtension = filename.split('.').pop() || 'pdf';
                    filename = `${attachment.expectedName}_${date}.${fileExtension}`;
                    console.log(`Using expected filename: ${filename}`);
                }
            }
            
            // 파일명 정리 (특수문자 제거)
            filename = filename.replace(/[<>:"/\\|?*]/g, '_');
            const filePath = path.join(this.rawDir, `${post.boardId}_${post.postNo}_${filename}`);
            
            fs.writeFileSync(filePath, response.data);
            console.log(`✅ Downloaded: ${filePath} (${response.data.length} bytes)`);
            
            return {
                ...attachment,
                filename,
                filePath,
                size: response.data.length
            };
            
        } catch (error) {
            console.error(`❌ Download failed: ${attachment.url}`, error.message);
            return null;
        }
    }

    // 5. Excel 파일 파싱
    parseExcelFile(filePath) {
        try {
            const workbook = XLSX.readFile(filePath);
            const sheets = workbook.SheetNames;
            let allTexts = [];

            sheets.forEach(sheetName => {
                const sheet = workbook.Sheets[sheetName];
                const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
                
                data.forEach((row, rowIndex) => {
                    if (row && row.length > 0) {
                        const rowText = row.join(' | ');
                        if (rowText.trim()) {
                            allTexts.push({
                                text: rowText,
                                metadata: {
                                    filename: path.basename(filePath),
                                    sheet: sheetName,
                                    row: rowIndex,
                                    source: 'excel'
                                }
                            });
                        }
                    }
                });
            });

            return allTexts;
        } catch (error) {
            console.error('Excel parsing failed:', error.message);
            return [];
        }
    }

    // 6. 전체 크롤링 파이프라인
    async crawlBoard(boardId, limit = 5) {
        console.log(`\n=== Starting crawl for board ${boardId} ===`);
        
        try {
            // 1. 게시글 목록 가져오기
            const posts = await this.fetchBoardList(boardId, limit);
            console.log(`Found ${posts.length} posts`);
            
            const results = [];
            
            for (const post of posts) {
                console.log(`\n--- Processing: ${post.title} ---`);
                
                // 항암화학요법 게시판의 경우 게시글 목록에서 첨부파일 찾기
                let attachments = [];
                let postDetail;
                
                if (boardId === 'HIRAA030023030000') {
                    // 항암화학요법 게시판: 첨부파일만 다운로드, 본문 텍스트는 추출하지 않음
                    const listResponse = await axios.get(`${this.baseUrl}/bbsDummy.do?pgmid=${boardId}`, {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                        }
                    });
                    const list$ = cheerio.load(listResponse.data);
                    attachments = this.extractAttachmentUrlsFromList(list$, post);
                    
                    // 본문 텍스트는 추출하지 않고 기본 정보만 설정
                    postDetail = {
                        ...post,
                        bodyText: '',
                        textFile: '',
                        attachments: []
                    };
                } else {
                    // 공고 게시판: 상세 내용과 첨부파일 모두 가져오기
                    postDetail = await this.fetchPostDetail({
                        ...post,
                        boardId
                    });
                    attachments = postDetail.attachments;
                }
                
                // 3. 첨부파일 다운로드
                const downloadedFiles = [];
                for (const attachment of attachments) {
                    const downloaded = await this.downloadFile(attachment, postDetail);
                    if (downloaded) {
                        downloadedFiles.push(downloaded);
                        
                        // 4. Excel 파일이면 파싱 (공고 게시판에서만 텍스트 파일에 추가)
                        if (downloaded.filename.toLowerCase().includes('.xlsx') || 
                            downloaded.filename.toLowerCase().includes('.xls')) {
                            const excelTexts = this.parseExcelFile(downloaded.filePath);
                            console.log(`Parsed Excel: ${excelTexts.length} rows`);
                            
                            // Excel 내용을 텍스트 파일에 추가 (공고 게시판에서만)
                            if (excelTexts.length > 0 && boardId !== 'HIRAA030023030000') {
                                const excelContent = excelTexts.map(item => item.text).join('\n');
                                fs.appendFileSync(postDetail.textFile, `\n\n=== Excel Content ===\n${excelContent}`);
                            }
                        }
                    }
                }
                
                results.push({
                    ...postDetail,
                    downloadedFiles
                });
                
                // 요청 간 딜레이
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            
            console.log(`\n=== Crawl completed for board ${boardId} ===`);
            console.log(`Processed ${results.length} posts`);
            console.log(`Downloaded ${results.reduce((sum, r) => sum + r.downloadedFiles.length, 0)} files`);
            
            return results;
            
        } catch (error) {
            console.error('Crawl failed:', error.message);
            return [];
        }
    }
}

// 사용 예시
async function main() {
    const crawler = new EnhancedHiraCrawler();
    
    // 공고 게시판
    await crawler.crawlBoard('HIRAA030023010000', 2);
    
    // 항암화학요법 게시판
    await crawler.crawlBoard('HIRAA030023030000', 2);
}

export default EnhancedHiraCrawler; 
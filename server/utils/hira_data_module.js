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
import cheerio from 'cheerio';
import textract from 'textract';
import pdfParse from 'pdf-parse';
import xlsx from 'xlsx';
import iconv from 'iconv-lite';
import cron from 'node-cron';
import minimist from 'minimist';
import { Hwp } from 'node-hwpjs';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { OpenAIEmbeddings } from '@langchain/openai';
import { HNSWLib } from '@langchain/community/vectorstores/hnswlib';
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
  { boardId: BOARD_A, limit: 1 },
  { boardId: BOARD_B, limit: 1 }
];

const CHUNK_SIZE     = 1000;
const CHUNK_OVERLAP  = 200;
const DAILY_CRON_KST = '15 2 * * *'; // 02:15 every day (Asia/Seoul)

// --------------------------- Utilities ---------------------------------------
const embeddings = new OpenAIEmbeddings({
  openAIApiKey: process.env.OPENAI_API_KEY,
  modelName: process.env.OPENAI_EMBED_MODEL || 'text-embedding-ada-002'
});

[DATA_DIR, RAW_DIR, TEXT_DIR, VECTOR_DIR].forEach((p) => fs.mkdirSync(p, { recursive: true }));

function loadRegistry() {
  try { return fs.existsSync(REGISTRY_PATH) ? JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf-8')) : {}; }
  catch { return {}; }
}
function saveRegistry(reg) { fs.writeFileSync(REGISTRY_PATH, JSON.stringify(reg, null, 2)); }

// --------------------------- 1. CRAWLER --------------------------------------
async function fetchBoard(boardId, limit = 1) {
  const url = `https://www.hira.or.kr/bbsDummy.do?pgmid=${boardId}`;
  const { data } = await axios.get(url, { responseType: 'arraybuffer' });
  const $ = cheerio.load(iconv.decode(data, 'utf-8'));
  const posts = [];
  $('table tbody tr').slice(0, limit).each((_, el) => {
    const tds = $(el).find('td');
    const no = parseInt(tds.eq(0).text().trim(), 10);
    const a = $(el).find('a').first();
    if (!a.length || Number.isNaN(no)) return;
    const detailUrl = new URL(a.attr('href'), 'https://www.hira.or.kr').href;
    posts.push({ boardId, postNo: no, title: a.text().trim(), detailUrl });
  });
  return posts;
}

async function fetchPost(post) {
  const { data } = await axios.get(post.detailUrl, { responseType: 'arraybuffer' });
  const $ = cheerio.load(iconv.decode(data, 'utf-8'));
  const contentBlock = $('.cont_area, .board_view_cont, .view').first();
  const bodyText = contentBlock.text().trim();

  const textFile = path.join(TEXT_DIR, `${post.boardId}_${post.postNo}.txt`);
  fs.writeFileSync(textFile, bodyText);

  const attachments = [];
  $('a').each((_, a) => {
    const href = $(a).attr('href') || '';
    const onclick = $(a).attr('onclick') || '';
    const push = (link) => attachments.push(new URL(link, 'https://www.hira.or.kr').href);
    if (/fileDownloadBbsBltFile/.test(onclick)) {
      const m = onclick.match(/fileDownloadBbsBltFile\('([^']+)',(\d+),(\d+),(\d+)\)/);
      if (m) {
        const [_, pgmid, brdBltNo, brdScnBltNo, fileSeq] = m;
        push(`/fileDownloadBbsBltFile.do?pgmid=${pgmid}&brdBltNo=${brdBltNo}&brdScnBltNo=${brdScnBltNo}&fileSeq=${fileSeq}`);
      }
    } else if (href && /\.(pdf|hwp|hwpx|docx?|xlsx?)$/i.test(href)) {
      push(href);
    }
  });

  for (const url of attachments) {
    try {
      const res = await axios.get(url, { responseType: 'arraybuffer' });
      const cd = res.headers['content-disposition'] || '';
      const nameMatch = cd.match(/filename\*=utf-8''([^;]+)/) || cd.match(/filename="?([^";]+)/);
      const fname = nameMatch ? decodeURIComponent(nameMatch[1]) : path.basename(url.split('?')[0]);
      const filePath = path.join(RAW_DIR, fname);
      fs.writeFileSync(filePath, res.data);
      post.attachments = post.attachments || [];
      post.attachments.push(filePath);
    } catch (e) { console.warn('Attachment DL fail', url, e.message); }
  }
  post.textFile = textFile;
  return post;
}

// --------------------------- 2. TEXT EXTRACTION ------------------------------
async function extractText(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.pdf') return (await pdfParse(fs.readFileSync(filePath))).text;
  if (ext === '.xlsx' || ext === '.xls') {
    const wb = xlsx.readFile(filePath); return wb.SheetNames.map((n) => xlsx.utils.sheet_to_csv(wb.Sheets[n])).join('\n');
  }
  if (ext === '.hwp' || ext === '.hwpx') {
    try { return new Hwp(filePath).getText(); } catch {}
  }
  return new Promise((res, rej) => textract.fromFileWithPath(filePath, (err, txt) => (err ? rej(err) : res(txt))));
}
// --------------------------- 3. CHUNK + VECTOR -------------------------------
const splitter = new RecursiveCharacterTextSplitter({ chunkSize: CHUNK_SIZE, chunkOverlap: CHUNK_OVERLAP });
async function makeDocs(text, meta) { return (await splitter.splitText(text)).map((c, i) => new Document({ pageContent: c, metadata: { ...meta, chunk: i } })); }
async function upsertDocs(docs) {
  const storePath = path.join(VECTOR_DIR, 'hira');
  fs.mkdirSync(storePath, { recursive: true });
  const vs = fs.existsSync(path.join(storePath, 'hnswlib.index')) ? await HNSWLib.load(storePath, embeddings) : await HNSWLib.fromDocuments([], embeddings);
  await vs.addDocuments(docs); await vs.save(storePath);
}

// --------------------------- 4. SYNC PIPELINE --------------------------------
async function processBoard(boardId, limit, force = false) {
  const registry = loadRegistry();
  let added = 0, newDetected = false;
  const posts = await fetchBoard(boardId, limit);
  for (const p of posts) {
    const processed = registry[boardId]?.includes(p.postNo);
    if (processed && !force) { console.log(`Skip #${p.postNo} (${boardId})`); continue; }
    const post = await fetchPost(p);
    const docs = [];
    docs.push(...(await makeDocs(fs.readFileSync(post.textFile, 'utf-8'), { source: 'body', boardId, postNo: post.postNo, filePath: post.textFile })));
    for (const f of post.attachments || []) docs.push(...(await makeDocs(await extractText(f), { source: path.basename(f), boardId, postNo: post.postNo, filePath: f,fileUrl: `/files/${path.basename(f)}`  })));
    await upsertDocs(docs);
    added += docs.length;
    registry[boardId] = registry[boardId] || [];
    if (!registry[boardId].includes(post.postNo)) registry[boardId].push(post.postNo);
    newDetected = true;
    console.log(`Post #${post.postNo} (${boardId}) processed → ${docs.length} chunks.`);
  }
  saveRegistry(registry);
  return { added, newDetected };
}

async function sync(force = false) {
  const resultA = await processBoard(BOARD_A, 1, force);
  // If board A had a new post, board B must be refreshed regardless of change.
  const forceB = force || resultA.newDetected;
  const resultB = await processBoard(BOARD_B, 1, forceB);
  const total = resultA.added + resultB.added;
  console.log(`Sync done. Added ${total} chunks (A:${resultA.added}, B:${resultB.added})`);
}

// --------------------------- 5. QUERY ----------------------------------------
async function query(q) {
  const storePath = path.join(VECTOR_DIR, 'hira');
  if (!fs.existsSync(path.join(storePath, 'hnswlib.index'))) { console.error('Vector store empty — run --sync first'); return; }
  const vs = await HNSWLib.load(storePath, embeddings);
  const res = await vs.similaritySearch(q, 5);
  res.forEach((r, i) => {
    const m = r.metadata;
    console.log(`\n[${i + 1}] score≈${r.score?.toFixed(3)}  post #${m.postNo} (${m.boardId})  file: ${m.filePath}`);
    console.log(`   ${r.pageContent.slice(0, 200)}…`);
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

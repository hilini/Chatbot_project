import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 환경 변수 로드
dotenv.config({ path: path.resolve(__dirname, '.env') });

async function quickTest() {
  console.log('=== 챗봇 빠른 진단 테스트 ===\n');

  const results = {
    environment: {},
    modules: {},
    issues: []
  };

  // 1. 환경 체크
  console.log('1. 환경 체크...');
  results.environment = {
    nodeVersion: process.version,
    openaiApiKey: !!process.env.OPENAI_API_KEY,
    platform: process.platform
  };
  console.log(`   Node.js: ${results.environment.nodeVersion}`);
  console.log(`   OpenAI API 키: ${results.environment.openaiApiKey ? '✅ 있음' : '❌ 없음'}`);
  console.log(`   플랫폼: ${results.environment.platform}`);

  // 2. 모듈 로드 테스트
  console.log('\n2. 모듈 로드 테스트...');
  try {
    const enhancedDataModule = await import('./server/utils/enhanced_data_module.js');
    console.log('   ✅ enhanced_data_module 로드 성공');
    results.modules.enhancedDataModule = true;
  } catch (error) {
    console.log(`   ❌ enhanced_data_module 로드 실패: ${error.message}`);
    results.modules.enhancedDataModule = false;
    results.issues.push(`모듈 로드 실패: ${error.message}`);
  }

  // 3. 디렉토리 체크
  console.log('\n3. 디렉토리 체크...');
  const dirs = [
    './server/data/vector',
    './server/data/raw', 
    './server/data/text'
  ];
  
  for (const dir of dirs) {
    const fullPath = path.join(__dirname, dir);
    if (fs.existsSync(fullPath)) {
      const stats = fs.statSync(fullPath);
      console.log(`   ✅ ${dir}: ${stats.size} bytes`);
    } else {
      console.log(`   ❌ ${dir}: 없음`);
      results.issues.push(`디렉토리 없음: ${dir}`);
    }
  }

  // 4. 메타데이터 체크
  console.log('\n4. 메타데이터 체크...');
  const metadataFile = path.join(__dirname, 'server/data/vector/metadata.json');
  if (fs.existsSync(metadataFile)) {
    try {
      const metadata = JSON.parse(fs.readFileSync(metadataFile, 'utf-8'));
      console.log(`   ✅ 메타데이터 파일: ${Object.keys(metadata.files || {}).length}개 파일`);
      console.log(`   ✅ 게시판: ${Object.keys(metadata.boards || {}).length}개`);
    } catch (error) {
      console.log(`   ❌ 메타데이터 파싱 실패: ${error.message}`);
      results.issues.push(`메타데이터 파싱 실패: ${error.message}`);
    }
  } else {
    console.log('   ❌ 메타데이터 파일 없음');
    results.issues.push('메타데이터 파일 없음');
  }

  // 5. 벡터 스토어 체크
  console.log('\n5. 벡터 스토어 체크...');
  const vectorStorePath = path.join(__dirname, 'server/data/vector/hira');
  if (fs.existsSync(vectorStorePath)) {
    const stats = fs.statSync(vectorStorePath);
    console.log(`   ✅ 벡터 스토어: ${stats.size} bytes`);
  } else {
    console.log('   ❌ 벡터 스토어 없음');
    results.issues.push('벡터 스토어 없음');
  }

  // 6. 간단한 기능 테스트
  console.log('\n6. 기능 테스트...');
  if (results.modules.enhancedDataModule) {
    try {
      const { default: enhancedDataModule, EnhancedDataModule } = await import('./server/utils/enhanced_data_module.js');
      const instance = new EnhancedDataModule();
      
      // 메타데이터 가져오기 테스트
      const metadata = instance.getMetadata();
      console.log(`   ✅ 메타데이터 가져오기: ${Object.keys(metadata.files || {}).length}개 파일`);
      
      // 임베딩 테스트
      if (instance.embeddings) {
        console.log('   ✅ 임베딩 모델 초기화됨');
      } else {
        console.log('   ❌ 임베딩 모델 초기화 안됨 (API 키 없음)');
        results.issues.push('임베딩 모델 초기화 안됨');
      }
      
    } catch (error) {
      console.log(`   ❌ 기능 테스트 실패: ${error.message}`);
      results.issues.push(`기능 테스트 실패: ${error.message}`);
    }
  }

  // 7. 종합 결과
  console.log('\n=== 종합 결과 ===');
  console.log(`총 문제점: ${results.issues.length}개`);
  
  if (results.issues.length === 0) {
    console.log('✅ 모든 체크 통과! 챗봇이 정상적으로 설정되었습니다.');
  } else {
    console.log('\n❌ 발견된 문제점:');
    results.issues.forEach((issue, index) => {
      console.log(`   ${index + 1}. ${issue}`);
    });
    
    console.log('\n🔧 해결 방법:');
    if (!results.environment.openaiApiKey) {
      console.log('   - .env 파일에 OPENAI_API_KEY를 설정하세요.');
    }
    if (results.issues.some(issue => issue.includes('벡터 스토어 없음'))) {
      console.log('   - npm run rebuild-vector-store를 실행하여 벡터 스토어를 생성하세요.');
    }
    if (results.issues.some(issue => issue.includes('메타데이터'))) {
      console.log('   - 데이터 동기화를 실행하여 메타데이터를 생성하세요.');
    }
  }

  // 결과 저장
  const resultFile = path.join(__dirname, 'quick_test_results.json');
  fs.writeFileSync(resultFile, JSON.stringify(results, null, 2));
  console.log(`\n진단 결과가 ${resultFile}에 저장되었습니다.`);
}

// 테스트 실행
quickTest().catch(console.error); 
const EnhancedHiraCrawler = require('./enhanced_crawler');

async function testAnticancerBoard() {
    const crawler = new EnhancedHiraCrawler();
    
    console.log('=== Testing Anticancer Therapy Board Crawling ===');
    
    // 항암화학요법 게시판에서 최신 게시글 2개 테스트
    const results = await crawler.crawlBoard('HIRAA030023030000', 2);
    
    console.log('\n=== Results ===');
    results.forEach((result, index) => {
        console.log(`\nPost ${index + 1}: ${result.title}`);
        console.log(`Text file: ${result.textFile}`);
        console.log(`Body text length: ${result.bodyText.length} characters`);
        console.log(`Downloaded files: ${result.downloadedFiles.length}`);
        
        result.downloadedFiles.forEach((file, fileIndex) => {
            console.log(`  File ${fileIndex + 1}: ${file.filename} (${file.size} bytes)`);
        });
    });
}

testAnticancerBoard().catch(console.error); 
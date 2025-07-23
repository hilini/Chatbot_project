import React, { useEffect, useState } from 'react';

const FilePreview = ({ file }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!file) return;
    setLoading(true);
    setError(null);
    
    // 파일 URL이 유효한지 확인
    console.log('Loading file:', file.filename);
    console.log('File URL:', `/files/${encodeURIComponent(file.filename)}`);
    
    // 파일 존재 여부 확인
    fetch(`/api/file-exists/${encodeURIComponent(file.filename)}`)
      .then(res => res.json())
      .then(data => {
        if (!data.exists) {
          setError('파일이 존재하지 않습니다.');
          setLoading(false);
        }
      })
      .catch(err => {
        console.error('File existence check failed:', err);
        // 파일 존재 확인이 실패해도 계속 진행
      });
  }, [file]);

  if (!file) return <div style={{margin:'2rem'}}>파일을 선택하세요.</div>;
  if (loading) return <div style={{margin:'2rem'}}>파일을 불러오는 중...</div>;
  if (error) return <div style={{margin:'2rem', color:'red'}}>{error}</div>;

  const fileUrl = `/files/${encodeURIComponent(file.filename)}`;
  const fileExtension = file.filename.split('.').pop().toLowerCase();

  // PDF 파일인 경우
  if (fileExtension === 'pdf') {
    return (
      <div style={{margin:'2rem', height:'calc(100vh - 200px)'}}>
        <h3>{file.filename}</h3>
        <div style={{border:'1px solid #ddd', borderRadius:'8px', overflow:'hidden', height:'100%', position:'relative'}}>
          {loading && (
            <div style={{
              position:'absolute',
              top:'50%',
              left:'50%',
              transform:'translate(-50%, -50%)',
              zIndex:1,
              background:'rgba(255,255,255,0.9)',
              padding:'1rem',
              borderRadius:'4px'
            }}>
              PDF 파일을 불러오는 중...
            </div>
          )}
          <iframe
            src={fileUrl}
            style={{width:'100%', height:'100%', border:'none'}}
            title={file.filename}
            onLoad={() => {
              console.log('PDF loaded successfully');
              setLoading(false);
            }}
            onError={() => {
              console.error('PDF load failed');
              setError('PDF 파일을 불러올 수 없습니다. 파일이 존재하지 않거나 접근할 수 없습니다.');
              setLoading(false);
            }}
          />
        </div>
        {error && (
          <div style={{marginTop:'1rem', padding:'1rem', background:'#f8d7da', color:'#721c24', borderRadius:'4px'}}>
            <p>{error}</p>
            <a 
              href={fileUrl} 
              target="_blank" 
              rel="noopener noreferrer"
              style={{color:'#007bff', textDecoration:'none'}}
            >
              새 창에서 열기
            </a>
          </div>
        )}
      </div>
    );
  }

  // 이미지 파일인 경우
  if (['jpg', 'jpeg', 'png', 'gif', 'bmp'].includes(fileExtension)) {
    return (
      <div style={{margin:'2rem'}}>
        <h3>{file.filename}</h3>
        <div style={{border:'1px solid #ddd', borderRadius:'8px', overflow:'hidden'}}>
          <img
            src={fileUrl}
            alt={file.filename}
            style={{maxWidth:'100%', height:'auto'}}
            onLoad={() => setLoading(false)}
            onError={() => {
              setError('이미지 파일을 불러올 수 없습니다.');
              setLoading(false);
            }}
          />
        </div>
      </div>
    );
  }

  // 텍스트 파일인 경우 (txt, json, csv 등)
  if (['txt', 'json', 'csv', 'md', 'log'].includes(fileExtension)) {
    return (
      <div style={{margin:'2rem'}}>
        <h3>{file.filename}</h3>
        <div style={{border:'1px solid #ddd', borderRadius:'8px', padding:'1rem', background:'#f9f9f9', maxHeight:'500px', overflow:'auto'}}>
          <pre style={{margin:0, whiteSpace:'pre-wrap', wordBreak:'break-word'}}>
            {/* 텍스트 파일 내용을 여기에 표시 */}
            파일 내용을 보려면 다운로드 버튼을 클릭하세요.
          </pre>
        </div>
      </div>
    );
  }

  // 기타 파일 형식 (Excel, Word, HWP 등)
  return (
    <div style={{margin:'2rem'}}>
      <h3>{file.filename}</h3>
      <div style={{border:'1px solid #ddd', borderRadius:'8px', padding:'2rem', textAlign:'center', background:'#f9f9f9'}}>
        <p>이 파일 형식은 브라우저에서 직접 미리보기를 지원하지 않습니다.</p>
        <p>파일을 다운로드하여 확인해주세요.</p>
        <a 
          href={fileUrl} 
          download={file.filename}
          style={{
            display:'inline-block',
            padding:'0.5rem 1rem',
            background:'#007bff',
            color:'white',
            textDecoration:'none',
            borderRadius:'4px',
            marginTop:'1rem'
          }}
        >
          📥 파일 다운로드
        </a>
      </div>
    </div>
  );
};

export default FilePreview; 
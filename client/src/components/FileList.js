import React, { useEffect, useState } from 'react';

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleString();
}

function formatUploadDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

const FileList = ({ onFileSelect }) => {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch('/api/downloaded-files')
      .then(res => res.json())
      .then(data => {
        setFiles(data.files || []);
        setLoading(false);
      })
      .catch(err => {
        setError('파일 목록을 불러오지 못했습니다.');
        setLoading(false);
      });
  }, []);

  if (loading) return <div style={{margin:'2rem', textAlign:'center'}}>파일 목록을 불러오는 중...</div>;
  if (error) return <div style={{margin:'2rem', color:'red', textAlign:'center'}}>{error}</div>;

  return (
    <div style={{margin:'2rem'}}>
      <h2>다운로드된 파일 목록</h2>
      {files.length === 0 ? (
        <div style={{textAlign:'center', padding:'2rem', color:'#666'}}>
          <p>다운로드된 파일이 없습니다.</p>
          <p style={{fontSize:'0.9rem'}}>HIRA 웹사이트에서 새로운 공고나 첨부파일이 있으면 자동으로 다운로드됩니다.</p>
        </div>
      ) : (
        <table style={{width:'100%', borderCollapse:'collapse'}}>
        <thead>
          <tr>
            <th style={{borderBottom:'1px solid #ccc', textAlign:'left'}}>파일명</th>
            <th style={{borderBottom:'1px solid #ccc'}}>게시판</th>
            <th style={{borderBottom:'1px solid #ccc'}}>업로드일</th>
            <th style={{borderBottom:'1px solid #ccc'}}>크기</th>
            <th style={{borderBottom:'1px solid #ccc'}}>다운로드</th>
          </tr>
        </thead>
        <tbody>
          {files.map(file => (
            <tr key={file.filename} style={{cursor:'pointer'}} onClick={() => onFileSelect && onFileSelect(file)}>
              <td style={{padding:'0.5rem 0'}}>
                {(() => {
                  // 파일명에서 의미있는 부분 추출
                  const match = file.filename.match(/^(HIRAA030023010000|HIRAA030023030000|undefined)_(\d+)_(.+)$/);
                  if (match) {
                    const [, board, postNo, rest] = match;
                    // 게시글 번호와 확장자만 표시
                    const ext = rest.split('.').pop();
                    return `게시글 #${postNo}.${ext}`;
                  }
                  return file.filename;
                })()}
              </td>
              <td style={{textAlign:'center'}}>
                <span style={{
                  padding: '0.2rem 0.5rem',
                  borderRadius: '4px',
                  fontSize: '0.8rem',
                  background: file.boardName === '공고' ? '#e3f2fd' : '#f3e5f5',
                  color: file.boardName === '공고' ? '#1976d2' : '#7b1fa2'
                }}>
                  {file.boardName}
                </span>
              </td>
              <td style={{textAlign:'center'}}>{formatUploadDate(file.uploadDate)}</td>
              <td style={{textAlign:'center'}}>{file.readableSize || formatBytes(file.size)}</td>
              <td style={{textAlign:'center'}}>
                <a 
                  href={file.downloadUrl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  style={{color: '#007bff', textDecoration: 'none'}}
                >
                  📥
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      )}
    </div>
  );
};

export default FileList; 
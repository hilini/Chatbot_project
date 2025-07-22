import React, { useEffect, useState } from 'react';

const FilePreview = ({ file }) => {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setContent('');
    fetch(`/files/${encodeURIComponent(file.filename)}`)
      .then(res => {
        if (!res.ok) throw new Error('파일을 불러올 수 없습니다.');
        return res.text();
      })
      .then(text => setContent(text))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [file]);

  if (!file) return <div style={{margin:'2rem'}}>파일을 선택하세요.</div>;
  if (loading) return <div style={{margin:'2rem'}}>Loading file...</div>;
  if (error) return <div style={{margin:'2rem', color:'red'}}>{error}</div>;

  let display;
  try {
    const json = JSON.parse(content);
    display = <pre style={{background:'#f6f6f6', padding:'1rem', borderRadius:'6px', overflowX:'auto'}}>{JSON.stringify(json, null, 2)}</pre>;
  } catch {
    display = <pre style={{background:'#f6f6f6', padding:'1rem', borderRadius:'6px', overflowX:'auto'}}>{content}</pre>;
  }

  return (
    <div style={{margin:'2rem'}}>
      <h3>{file.filename} 미리보기</h3>
      {display}
    </div>
  );
};

export default FilePreview; 
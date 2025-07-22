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

const FileList = ({ onFileSelect }) => {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch('/api/files')
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

  if (loading) return <div>Loading file list...</div>;
  if (error) return <div style={{color:'red'}}>{error}</div>;

  return (
    <div style={{margin:'2rem'}}>
      <h2>서버 파일 목록</h2>
      <table style={{width:'100%', borderCollapse:'collapse'}}>
        <thead>
          <tr>
            <th style={{borderBottom:'1px solid #ccc', textAlign:'left'}}>파일명</th>
            <th style={{borderBottom:'1px solid #ccc'}}>크기</th>
            <th style={{borderBottom:'1px solid #ccc'}}>수정일</th>
          </tr>
        </thead>
        <tbody>
          {files.map(file => (
            <tr key={file.filename} style={{cursor:'pointer'}} onClick={() => onFileSelect && onFileSelect(file)}>
              <td style={{padding:'0.5rem 0'}}>{file.filename}</td>
              <td style={{textAlign:'center'}}>{formatBytes(file.size)}</td>
              <td style={{textAlign:'center'}}>{formatDate(file.mtime)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default FileList; 
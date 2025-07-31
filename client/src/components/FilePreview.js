import React, { useEffect, useState } from 'react';
import DocumentViewer from './DocumentViewer';
import { useSelector, useDispatch } from 'react-redux';
import { setPdfMode } from '../store/actions';

const FilePreview = ({ file }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const currentPage = useSelector(state => state.pdfViewer.currentPage);
  const pdfMode = useSelector(state => state.pdfViewer.pdfMode);
  const dispatch = useDispatch();

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
        } else {
          setLoading(false);
        }
      })
      .catch(err => {
        console.error('File existence check failed:', err);
        setLoading(false);
      });
  }, [file]);

  if (!file) return <div style={{margin:'2rem'}}>파일을 선택하세요.</div>;
  if (loading) return <div style={{margin:'2rem'}}>파일을 불러오는 중...</div>;
  if (error) return <div style={{margin:'2rem', color:'red'}}>{error}</div>;

  // DocumentViewer 사용
  return (
    <div style={{height:'calc(100vh - 80px)'}}>
      <DocumentViewer 
        file={file}
        currentPage={currentPage}
        pdfMode={pdfMode}
        onToggleMode={() => {
          const newMode = pdfMode === 'single' ? 'scroll' : 'single';
          dispatch(setPdfMode(newMode));
        }}
      />
    </div>
  );


};

export default FilePreview; 
import React, { useState, useEffect, useRef } from 'react';
import { Document, Page } from 'react-pdf';
import { pdfjs } from 'react-pdf';
import { useDispatch, useSelector } from 'react-redux';
import { setCurrentPage, setTotalPages } from '../store/actions';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';
import '../App.css';
import './DocumentViewer.css';

// PDF.js 워커 설정
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

const DEFAULT_SCALE = 1.2;

// Excel 뷰어 컴포넌트
const ExcelViewer = ({ fileUrl, filename }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeSheet, setActiveSheet] = useState(0);

  useEffect(() => {
    const loadExcelData = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/excel-data?file=${encodeURIComponent(filename)}`);
        if (!response.ok) {
          throw new Error('Excel 파일을 불러올 수 없습니다.');
        }
        const excelData = await response.json();
        setData(excelData);
        setActiveSheet(0);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    loadExcelData();
  }, [filename]);

  if (loading) return <div className="document-loading">Excel 파일을 불러오는 중...</div>;
  if (error) return <div className="document-error">{error}</div>;
  if (!data || data.sheets.length === 0) return <div className="document-error">데이터가 없습니다.</div>;

  const currentSheet = data.sheets[activeSheet];

  return (
    <div className="excel-viewer">
      <div className="excel-controls">
        <div className="sheet-selector">
          <label>시트: </label>
          <select 
            value={activeSheet} 
            onChange={(e) => setActiveSheet(parseInt(e.target.value))}
            className="sheet-select"
          >
            {data.sheets.map((sheet, index) => (
              <option key={index} value={index}>
                {sheet.name || `시트${index + 1}`}
              </option>
            ))}
          </select>
        </div>
        <div className="excel-info">
          <span>행: {currentSheet.data.length}</span>
          <span>열: {currentSheet.data[0]?.length || 0}</span>
        </div>
      </div>
      
      <div className="excel-table-container">
        <table className="excel-table">
          <tbody>
            {currentSheet.data.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex} className="excel-cell">
                    {cell || ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// 텍스트 뷰어 컴포넌트
const TextViewer = ({ fileUrl, filename }) => {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadTextContent = async () => {
      try {
        setLoading(true);
        const response = await fetch(fileUrl);
        if (!response.ok) {
          throw new Error('텍스트 파일을 불러올 수 없습니다.');
        }
        const text = await response.text();
        setContent(text);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    loadTextContent();
  }, [fileUrl]);

  if (loading) return <div className="document-loading">텍스트 파일을 불러오는 중...</div>;
  if (error) return <div className="document-error">{error}</div>;

  return (
    <div className="text-viewer">
      <div className="text-content">
        <pre>{content}</pre>
      </div>
    </div>
  );
};

// 이미지 뷰어 컴포넌트
const ImageViewer = ({ fileUrl, filename }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  return (
    <div className="image-viewer">
      {loading && <div className="document-loading">이미지를 불러오는 중...</div>}
      {error && <div className="document-error">{error}</div>}
      <img
        src={fileUrl}
        alt={filename}
        className="document-image"
        onLoad={() => setLoading(false)}
        onError={() => {
          setError('이미지를 불러올 수 없습니다.');
          setLoading(false);
        }}
      />
    </div>
  );
};

// 지원하지 않는 파일 형식 뷰어
const UnsupportedViewer = ({ filename, fileUrl }) => {
  return (
    <div className="unsupported-viewer">
      <div className="unsupported-content">
        <h3>지원하지 않는 파일 형식</h3>
        <p>파일명: {filename}</p>
        <p>이 파일 형식은 브라우저에서 직접 미리보기를 지원하지 않습니다.</p>
        <a 
          href={fileUrl} 
          download={filename}
          className="download-button"
        >
          📥 파일 다운로드
        </a>
      </div>
    </div>
  );
};

// 메인 DocumentViewer 컴포넌트
const DocumentViewer = ({ file, currentPage, pdfMode, onToggleMode }) => {
  const [numPages, setNumPages] = useState(null);
  const [scale, setScale] = useState(DEFAULT_SCALE);
  const [jumpToPage, setJumpToPage] = useState('');
  const [isDocumentLoaded, setIsDocumentLoaded] = useState(false);

  const containerRef = useRef(null);
  
  const dispatch = useDispatch();

  if (!file) {
    return <div className="document-placeholder">문서를 선택하세요.</div>;
  }

  const fileUrl = `/files/${encodeURIComponent(file.filename)}`;
  const fileExtension = file.filename.split('.').pop().toLowerCase();

  // 파일 형식별 뷰어 선택
  const getViewerComponent = () => {
    // PDF 파일
    if (fileExtension === 'pdf') {
      return (
        <Document
          file={fileUrl}
          onLoadSuccess={({ numPages }) => {
            setNumPages(numPages);
            dispatch(setTotalPages(numPages));
            setIsDocumentLoaded(true);
            if (!currentPage || currentPage > numPages) {
              dispatch(setCurrentPage(1));
            }
          }}
          onLoadError={(error) => {
            console.error('PDF 로드 오류:', error);
          }}
          loading={<div className="document-loading">PDF 문서 로딩 중...</div>}
          error={
            <div className="document-error">
              <div>PDF 불러오기 실패.</div>
              <p>PDF 서버에 문제가 있거나 파일이 존재하지 않습니다.</p>
            </div>
          }
          className="pdf-document"
        >
          {pdfMode === 'single' ? (
            <Page
              pageNumber={currentPage}
              scale={scale}
              renderTextLayer={true}
              renderAnnotationLayer={true}
              className="pdf-page"
            />
          ) : (
            Array.from(new Array(numPages), (_, index) => (
              <Page
                key={`page_${index + 1}`}
                pageNumber={index + 1}
                scale={scale}
                renderTextLayer={true}
                renderAnnotationLayer={true}
                className={`pdf-page ${index + 1 === currentPage ? 'current-page' : ''}`}
              />
            ))
          )}
        </Document>
      );
    }

    // Excel 파일
    if (['xlsx', 'xls'].includes(fileExtension)) {
      return <ExcelViewer fileUrl={fileUrl} filename={file.filename} />;
    }

    // 이미지 파일
    if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(fileExtension)) {
      return <ImageViewer fileUrl={fileUrl} filename={file.filename} />;
    }

    // 텍스트 파일
    if (['txt', 'json', 'csv', 'md', 'log', 'xml', 'html'].includes(fileExtension)) {
      return <TextViewer fileUrl={fileUrl} filename={file.filename} />;
    }

    // 지원하지 않는 파일 형식
    return <UnsupportedViewer filename={file.filename} fileUrl={fileUrl} />;
  };

  // PDF 전용 컨트롤 (PDF가 아닌 경우 숨김)
  const renderPdfControls = () => {
    if (fileExtension !== 'pdf') return null;

    const changePage = (offset) => {
      const newPage = currentPage + offset;
      if (newPage >= 1 && newPage <= numPages) {
        dispatch(setCurrentPage(newPage));
      }
    };

    const handleJumpToPage = (e) => {
      e.preventDefault();
      const pageNumber = parseInt(jumpToPage, 10);
      if (!isNaN(pageNumber) && pageNumber >= 1 && pageNumber <= numPages) {
        dispatch(setCurrentPage(pageNumber));
        setJumpToPage('');
      }
    };

    const changeScale = (delta) => {
      const newScale = Math.max(0.8, Math.min(scale + delta, 2.5));
      setScale(newScale);
    };

    return (
      <div className="pdf-controls">
        <div className="pdf-navigation-controls">
          <button 
            onClick={() => changePage(-1)} 
            disabled={pdfMode === 'single' && currentPage <= 1}
            className="pdf-control-button"
            aria-label="이전 페이지"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6"/>
            </svg>
          </button>
          
          <span className="page-info">
            <strong>{currentPage}</strong> / {numPages || '-'}
          </span>
          
          <button 
            onClick={() => changePage(1)} 
            disabled={pdfMode === 'single' && currentPage >= numPages}
            className="pdf-control-button"
            aria-label="다음 페이지"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18l6-6-6-6"/>
            </svg>
          </button>
        </div>
        
        <div className="pdf-zoom-controls">
          <button 
            onClick={() => changeScale(-0.1)} 
            className="pdf-control-button"
            aria-label="축소"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              <line x1="8" y1="11" x2="14" y2="11"></line>
            </svg>
          </button>
          
          <span className="scale-info">{Math.round(scale * 100)}%</span>
          
          <button 
            onClick={() => changeScale(0.1)} 
            className="pdf-control-button"
            aria-label="확대"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              <line x1="11" y1="8" x2="11" y2="14"></line>
              <line x1="8" y1="11" x2="14" y2="11"></line>
            </svg>
          </button>
        </div>
        
        <form className="jump-to-page-form" onSubmit={handleJumpToPage}>
          <input
            type="text"
            value={jumpToPage}
            onChange={(e) => setJumpToPage(e.target.value)}
            placeholder="페이지 번호"
            className="jump-to-page-input"
            aria-label="페이지 입력"
          />
          <button 
            type="submit" 
            className="pdf-control-button"
            aria-label="페이지 이동"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 10 4 15 9 20"></polyline>
              <path d="M20 4v7a4 4 0 0 1-4 4H4"></path>
            </svg>
          </button>
        </form>
        
        <button 
          onClick={onToggleMode}
          className={`pdf-mode-toggle pdf-control-button ${pdfMode === 'scroll' ? 'active' : ''}`}
          aria-label="보기 모드 전환"
        >
          {pdfMode === 'single' ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7m0-18H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h7m0-18v18"></path>
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
            </svg>
          )}
        </button>
      </div>
    );
  };

  return (
    <div className="document-viewer">
      {renderPdfControls()}
      
      <div 
        className={`document-container ${fileExtension === 'pdf' ? (pdfMode === 'scroll' ? 'scroll-mode' : 'single-mode') : ''}`}
        ref={containerRef}
      >
        {getViewerComponent()}
      </div>
    </div>
  );
};

export default DocumentViewer; 
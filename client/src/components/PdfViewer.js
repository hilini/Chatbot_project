import React, { useState, useEffect, useRef } from 'react';
import { Document, Page } from 'react-pdf';
import { pdfjs } from 'react-pdf';
import { useDispatch, useSelector } from 'react-redux';
import { setCurrentPage, setTotalPages } from '../store/actions';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';
import '../App.css';

// PDF.js 워커 설정 (버전 3.11.174용)
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

// 상수 설정

const DEFAULT_SCALE = 1.2;

// 페이지 분포 맵 컴포넌트
const PageDistributionMap = ({ 
  distribution, 
  totalPages, 
  currentPage, 
  onPageClick 
}) => {
  // 최대 표시 페이지 수
  const maxDisplayPages = 20;
  
  // 페이지 그룹화 계산 (페이지가 너무 많을 경우)
  const groupedPages = [];
  const groupSize = totalPages > maxDisplayPages ? Math.ceil(totalPages / maxDisplayPages) : 1;
  
  // 그룹화된 페이지 계산
  for (let i = 1; i <= totalPages; i += groupSize) {
    const endPage = Math.min(i + groupSize - 1, totalPages);
    const groupResultCount = distribution
      .filter(item => item.page >= i && item.page <= endPage)
      .reduce((sum, item) => sum + item.count, 0);
    
    groupedPages.push({
      startPage: i,
      endPage,
      resultCount: groupResultCount
    });
  }
  
  return (
    <div className="page-distribution-map">
      <div className="page-map-title">검색 결과 페이지 분포:</div>
      <div className="page-map-container">
        {groupedPages.map((group) => {
          const hasResults = group.resultCount > 0;
          const isCurrentPageInGroup = currentPage >= group.startPage && currentPage <= group.endPage;
          
          return (
            <div 
              key={`page-group-${group.startPage}`}
              className={`page-map-item ${hasResults ? 'has-results' : ''} ${isCurrentPageInGroup ? 'current-page-group' : ''}`}
              title={`페이지 ${group.startPage}-${group.endPage} (${group.resultCount}개 결과)`}
              onClick={() => hasResults && onPageClick(group.startPage)}
            >
              {hasResults && (
                <span className="result-count-indicator" style={{ 
                  opacity: Math.min(0.3 + (group.resultCount / 5) * 0.7, 1) 
                }}></span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
const PdfViewer = ({ fileUrl, currentPage, pdfMode, onToggleMode }) => {
  const [pdfUrl, setPdfUrl] = useState(DEFAULT_PDF_URL);
  const [numPages, setNumPages] = useState(null);
  const [scale, setScale] = useState(DEFAULT_SCALE);
  const ext = fileUrl.split('.').pop().toLowerCase();
  const [jumpToPage, setJumpToPage] = useState('');
  const [isDocumentLoaded, setIsDocumentLoaded] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [currentSearchIndex, setCurrentSearchIndex] = useState(0);
  const [resultPageDistribution, setResultPageDistribution] = useState([]);
  const [pdfLoadFailed, setPdfLoadFailed] = useState(false);
  const documentRef = useRef(null);
  const containerRef = useRef(null);
  const searchInputRef = useRef(null);
  
  const dispatch = useDispatch();
  const highlight = useSelector(state => state.pdfViewer.highlight);
  
  // PDF URL 재시도 로직
  useEffect(() => {
    if (pdfLoadFailed && pdfUrl === DEFAULT_PDF_URL) {
      console.log('기본 URL 로드 실패, 대체 URL 시도:', FALLBACK_PDF_URL);
      setPdfUrl(FALLBACK_PDF_URL);
      setPdfLoadFailed(false);
    }
  }, [pdfLoadFailed, pdfUrl]);
  
  // 문서가 로드되면 초기화
  const handleDocumentLoadSuccess = ({ numPages }) => {
    console.log('PDF 로드 성공:', pdfUrl);
    setNumPages(numPages);
    dispatch(setTotalPages(numPages));
    setIsDocumentLoaded(true);
    
    // 첫 로드 시 currentPage가 설정되지 않았다면 첫 페이지로 설정
    if (!currentPage || currentPage > numPages) {
      dispatch(setCurrentPage(1));
    }
  };
  
  // 페이지 이동 함수
  const changePage = (offset) => {
    const newPage = currentPage + offset;
    if (newPage >= 1 && newPage <= numPages) {
      dispatch(setCurrentPage(newPage));
    }
  };
  
  // 페이지 점프 핸들러
  const handleJumpToPage = (e) => {
    e.preventDefault();
    const pageNumber = parseInt(jumpToPage, 10);
    if (!isNaN(pageNumber) && pageNumber >= 1 && pageNumber <= numPages) {
      dispatch(setCurrentPage(pageNumber));
      setJumpToPage('');
    }
  };
  
  // 확대/축소 핸들러
  const changeScale = (delta) => {
    const newScale = Math.max(0.8, Math.min(scale + delta, 2.5));
    setScale(newScale);
  };
  
  // PDF 내용 검색 함수
  const searchInDocument = async () => {
    if (!searchTerm.trim() || !isDocumentLoaded) return;
    
    setIsSearching(true);
    const results = [];
    
    try {
      // 텍스트 레이어에서 검색
      const textLayers = document.querySelectorAll('.react-pdf__Page__textContent');
      
      // 페이지별 결과 추적
      const resultsByPage = {};
      
      textLayers.forEach((layer, pageIndex) => {
        const pageNumber = pageIndex + 1;
        const textItems = layer.querySelectorAll('span');
        
        let pageResultCount = 0;
        
        textItems.forEach((item) => {
          const text = item.textContent.toLowerCase();
          if (text.includes(searchTerm.toLowerCase())) {
            results.push({
              pageNumber,
              text: item.textContent,
              element: item
            });
            pageResultCount++;
          }
        });
        
        if (pageResultCount > 0) {
          resultsByPage[pageNumber] = pageResultCount;
        }
      });
      
      // 검색 결과를 상태로 저장
      setSearchResults(results);
      
      // 검색된 결과의 페이지별 분포 저장
      const pageDistribution = Object.entries(resultsByPage).map(([page, count]) => ({
        page: parseInt(page, 10),
        count
      })).sort((a, b) => a.page - b.page);
      
      setResultPageDistribution(pageDistribution);
      setCurrentSearchIndex(0);
      
      if (results.length > 0) {
        navigateToSearchResult(0, results);
      }
    } catch (error) {
      console.error('검색 중 오류 발생:', error);
    } finally {
      setIsSearching(false);
    }
  };
  
  // 검색 결과 간 이동
  const navigateToSearchResult = (index, results = searchResults) => {
    if (results.length === 0) return;
    
    // 인덱스가 범위를 벗어나면 순환
    const newIndex = (index + results.length) % results.length;
    setCurrentSearchIndex(newIndex);
    
    const result = results[newIndex];
    
    // 해당 페이지로 이동
    dispatch(setCurrentPage(result.pageNumber));
    
    // 하이라이트 적용
    setTimeout(() => {
      // 이전 하이라이트 제거
      document.querySelectorAll('.search-highlight').forEach(el => {
        el.classList.remove('search-highlight');
        el.classList.remove('current');
      });
      
      // 현재 페이지에 있는 모든 검색 결과 하이라이트
      const currentPageResults = searchResults.filter(r => r.pageNumber === result.pageNumber);
      currentPageResults.forEach(r => {
        if (r.element) {
          r.element.classList.add('search-highlight');
        }
      });
      
      // 현재 선택된 결과는 특별히 강조
      if (result.element) {
        result.element.classList.add('search-highlight');
        result.element.classList.add('current');
        
        // 스크롤 위치 조정
        result.element.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'center',
          inline: 'center'
        });
      }
    }, 300);
  };
  
  // 다음/이전 검색 결과로 이동
  const goToNextSearchResult = () => {
    navigateToSearchResult(currentSearchIndex + 1);
  };
  
  const goToPrevSearchResult = () => {
    navigateToSearchResult(currentSearchIndex - 1);
  };
  
  // 검색 제출 핸들러
  const handleSearchSubmit = (e) => {
    e.preventDefault();
    searchInDocument();
  };
  
  // 현재 페이지가 변경되면 해당 페이지로 스크롤(단일 페이지 모드일 때만)
  useEffect(() => {
    if (isDocumentLoaded && pdfMode === 'single') {
      // 수정된 부분: documentRef.current.querySelector 대신 문서에서 직접 찾기
      const pageElement = document.querySelector(
        `.react-pdf__Page[data-page-number="${currentPage}"]`
      );
      
      if (pageElement) {
        pageElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }, [currentPage, isDocumentLoaded, pdfMode]);
  
  // 텍스트 하이라이트 로직
  useEffect(() => {
    if (isDocumentLoaded && highlight.term) {
      // 하이라이트 처리를 위한 타이머 설정
      const timer = setTimeout(() => {
        const textElements = document.querySelectorAll('.react-pdf__Page__textContent');
        if (textElements.length > 0) {
          // 하이라이트 초기화
          document.querySelectorAll('.text-highlight').forEach(el => {
            el.className = el.className.replace(' text-highlight', '');
          });
          
          textElements.forEach(textLayer => {
            const textItems = textLayer.querySelectorAll('span');
            textItems.forEach(item => {
              if (item.textContent.toLowerCase().includes(highlight.term.toLowerCase())) {
                item.className += ' text-highlight';
              }
            });
          });
        }
      }, 500);
      
      return () => clearTimeout(timer);
    }
  }, [highlight, isDocumentLoaded, currentPage]);
  
  // 스크롤 모드인 경우 현재 표시되는 페이지 번호 업데이트
  useEffect(() => {
    if (pdfMode === 'scroll' && containerRef.current && isDocumentLoaded) {
      const handleScroll = () => {
        const container = containerRef.current;
        const pages = container.querySelectorAll('.react-pdf__Page');
        
        if (pages.length === 0) return;
        
        const containerRect = container.getBoundingClientRect();
        const containerMiddle = containerRect.top + containerRect.height / 3;
        
        let closestPage = null;
        let closestDistance = Infinity;
        
        pages.forEach(page => {
          const pageRect = page.getBoundingClientRect();
          const pageMiddle = pageRect.top + pageRect.height / 2;
          const distance = Math.abs(containerMiddle - pageMiddle);
          
          if (distance < closestDistance) {
            closestDistance = distance;
            closestPage = page;
          }
        });
        
        if (closestPage) {
          const pageNumber = parseInt(closestPage.getAttribute('data-page-number'), 10);
          if (pageNumber !== currentPage) {
            dispatch(setCurrentPage(pageNumber));
          }
        }
      };
      
      const container = containerRef.current;
      container.addEventListener('scroll', handleScroll);
      
      return () => {
        container.removeEventListener('scroll', handleScroll);
      };
    }
  }, [pdfMode, isDocumentLoaded, dispatch, currentPage]);
  
  // 스크롤 모드에서 처음 로드될 때 렌더링할 페이지 범위 계산
  const renderPages = () => {
    if (!isDocumentLoaded) return null;
    
    if (pdfMode === 'single') {
      // 단일 페이지 모드: 현재 페이지만 표시
      return (
        <Page
          pageNumber={currentPage}
          scale={scale}
          renderTextLayer={true}
          renderAnnotationLayer={true}
          className="pdf-page"
          key={`page_${currentPage}`}
        />
      );
    } else {
      // 스크롤 모드: 모든 페이지 표시
      return Array.from(new Array(numPages), (_, index) => (
        <Page
          key={`page_${index + 1}`}
          pageNumber={index + 1}
          scale={scale}
          renderTextLayer={true}
          renderAnnotationLayer={true}
          className={`pdf-page ${index + 1 === currentPage ? 'current-page' : ''}`}
        />
      ));
    }
  };
  
  // 키보드 단축키 핸들러 추가
  useEffect(() => {
    const handleKeyboardShortcuts = (e) => {
      // 입력란에 포커스가 있을 때는 적용하지 않음
      if (
        e.target.tagName === 'INPUT' || 
        e.target.tagName === 'TEXTAREA'
      ) {
        return;
      }
      
      switch (e.key) {
        case 'f':
          // Ctrl/Cmd + F와 충돌하지 않도록
          if (!e.ctrlKey && !e.metaKey) {
            searchInputRef.current?.focus();
            e.preventDefault();
          }
          break;
        case 'Escape':
          // 검색창이 활성화된 경우에만 ESC로 취소
          if (document.activeElement === searchInputRef.current) {
            searchInputRef.current.blur();
            e.preventDefault();
          }
          break;
        case 'n':
          // 검색 결과 간 이동
          if (searchResults.length > 0) {
            if (e.shiftKey) {
              goToPrevSearchResult();
            } else {
              goToNextSearchResult();
            }
            e.preventDefault();
          }
          break;
        case 'ArrowRight':
          // 오른쪽 화살표로 다음 페이지
          if (!e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
            changePage(1);
            e.preventDefault();
          }
          break;
        case 'ArrowLeft':
          // 왼쪽 화살표로 이전 페이지
          if (!e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
            changePage(-1);
            e.preventDefault();
          }
          break;
        default:
          break;
      }
    };
    
    document.addEventListener('keydown', handleKeyboardShortcuts);
    return () => {
      document.removeEventListener('keydown', handleKeyboardShortcuts);
    };
  }, [searchResults, currentSearchIndex]);
  
  // 검색 초기화 함수 추가
  const clearSearch = () => {
    setSearchTerm('');
    setSearchResults([]);
    setResultPageDistribution([]);
    
    // 모든 하이라이트 제거
    document.querySelectorAll('.search-highlight').forEach(el => {
      el.classList.remove('search-highlight');
      el.classList.remove('current');
    });
  };
  
  // 검색 단축키 안내를 추가한 검색 UI
  const renderSearchUI = () => {
    return (
      <div className="pdf-search-controls">
        <form onSubmit={handleSearchSubmit} className="pdf-search-form">
          <input
            ref={searchInputRef}
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="PDF 검색..."
            className="pdf-search-input"
            aria-label="PDF 검색"
          />
          <button 
            type="submit" 
            className="pdf-control-button"
            disabled={!searchTerm.trim() || isSearching}
            aria-label="검색"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
          </button>
          {(searchResults.length > 0 || searchTerm) && (
            <button
              type="button"
              className="pdf-control-button clear-search-button"
              onClick={clearSearch}
              aria-label="검색 초기화"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          )}
        </form>
        
        {isSearching && (
          <div className="search-status">
            <span className="search-loading">검색 중...</span>
          </div>
        )}
        
        {searchResults.length > 0 && (
          <div className="search-results-container">
            <div className="search-results-header">
              <h3>총 {searchResults.length}개 결과 찾음</h3>
              <button
                className="pdf-control-button close-results-button"
                onClick={clearSearch}
                aria-label="검색 결과 닫기"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
            <div className="search-results-page-distribution">
              <p>검색 결과 페이지 분포:</p>
              {searchResults.length > 0 && (
                <PageDistributionMap 
                  distribution={resultPageDistribution}
                  totalPages={numPages}
                  currentPage={currentPage}
                  onPageClick={(page) => dispatch(setCurrentPage(page))}
                />
              )}
            </div>
            
            <div className="search-results-info">
              <div className="search-navigation">
                <button 
                  onClick={goToPrevSearchResult} 
                  className="pdf-control-button search-nav-button"
                  aria-label="이전 검색 결과"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="18 15 12 9 6 15"></polyline>
                  </svg>
                </button>
                <span className="search-position">
                  <strong>{currentSearchIndex + 1}</strong> / {searchResults.length}
                </span>
                <button 
                  onClick={goToNextSearchResult} 
                  className="pdf-control-button search-nav-button"
                  aria-label="다음 검색 결과"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 12 15 18 9"></polyline>
                  </svg>
                </button>
              </div>
            </div>
            
            <div className="search-page-map">
              {searchResults.length > 0 && (
                <div className="search-current-result">
                  현재: <strong>P.{searchResults[currentSearchIndex]?.pageNumber}</strong>
                  {pdfMode === 'single' && (
                    <span className="search-result-context">
                      "{searchResults[currentSearchIndex]?.text.substring(0, 30)}..."
                    </span>
                  )}
                </div>
              )}
              
              {/* 키보드 단축키 안내 */}
              <div className="search-keyboard-shortcuts">
                <div className="search-keyboard-shortcut">
                  <kbd>F</kbd> 검색
                </div>
                <div className="search-keyboard-shortcut">
                  <kbd>N</kbd> 다음 결과
                </div>
                <div className="search-keyboard-shortcut">
                  <kbd>Shift</kbd>+<kbd>N</kbd> 이전 결과
                </div>
              </div>
            </div>
          </div>
        )}
        
        {searchTerm && searchResults.length === 0 && !isSearching && (
          <div className="search-no-results">
            검색 결과가 없습니다.
          </div>
        )}
      </div>
    );
  };
  

  // return (
  //   <div className="pdf-viewer">
  //     {ext === 'pdf' ? (
  //       <>
  //         {/* 기존 PDF 렌더링 */}

  return (
    <div className="pdf-viewer">
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
        
        {renderSearchUI()}
        
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
      
      <div 
        className={`pdf-container ${pdfMode === 'scroll' ? 'scroll-mode' : 'single-mode'}`}
        ref={containerRef}
      >
        {numPages === null && !isDocumentLoaded && (
          <div className="pdf-placeholder">
            <div className="pdf-message">
              PDF 불러오기 실패. 새로고침 해주세요.
              <button 
                onClick={() => window.location.reload()} 
                className="pdf-reload-button"
              >
                새로고침
              </button>
            </div>
          </div>
        )}
        
        <Document
          file={pdfUrl}
          onLoadSuccess={handleDocumentLoadSuccess}
          onLoadError={(error) => {
            console.error('PDF 로드 오류:', error);
            console.log('시도한 PDF URL:', pdfUrl);
            setPdfLoadFailed(true);
          }}
          loading={<div className="pdf-loading">PDF 문서 로딩 중...</div>}
          error={
            <div className="pdf-error">
              <div>PDF 불러오기 실패. ({pdfUrl})</div>
              <p>PDF 서버에 문제가 있거나 파일이 존재하지 않습니다.</p>
              <div className="pdf-error-actions">
                <button 
                  onClick={() => window.location.reload()} 
                  className="pdf-reload-button"
                >
                  새로고침
                </button>
                {pdfUrl === DEFAULT_PDF_URL && (
                  <button 
                    onClick={() => {
                      setPdfUrl(FALLBACK_PDF_URL);
                      setPdfLoadFailed(false);
                    }}
                    className="pdf-reload-button"
                  >
                    다른 경로로 시도
                  </button>
                )}
              </div>
            </div>
          }
          className="pdf-document"
        >
          {renderPages()}
        </Document>
      </div>
    </div>
  );
};

export default PdfViewer; 
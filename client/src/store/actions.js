// 액션 타입 정의
export const SET_HIGHLIGHT = 'SET_HIGHLIGHT';
export const SET_CURRENT_PAGE = 'SET_CURRENT_PAGE';
export const SET_TOTAL_PAGES = 'SET_TOTAL_PAGES';
export const SET_PDF_MODE = 'SET_PDF_MODE';

/**
 * PDF에서 텍스트를 강조 표시하는 액션 생성자
 * @param {string} term - 강조할 텍스트
 * @param {number} page - 강조할 페이지 번호
 * @returns {Object} 액션 객체
 */
export const setHighlight = (term, page) => ({
  type: SET_HIGHLIGHT,
  payload: {
    term,
    page
  }
});

/**
 * 현재 페이지 설정 액션
 * @param {number} pageNumber - 설정할 페이지 번호
 * @returns {Object} 액션 객체
 */
export const setCurrentPage = (pageNumber) => ({
  type: SET_CURRENT_PAGE,
  payload: pageNumber
});

/**
 * 총 페이지 수 설정 액션
 * @param {number} totalPages - 설정할 총 페이지 수
 * @returns {Object} 액션 객체
 */
export const setTotalPages = (totalPages) => ({
  type: SET_TOTAL_PAGES,
  payload: totalPages
});

/**
 * PDF 모드 설정 액션 (단일 페이지 또는 스크롤 모드)
 * @param {string} mode - 설정할 PDF 모드 (예: 'single', 'scroll')
 * @returns {Object} 액션 객체
 */
export const setPdfMode = (mode) => ({
  type: SET_PDF_MODE,
  payload: mode
}); 
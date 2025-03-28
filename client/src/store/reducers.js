import { combineReducers } from 'redux';
import {
  SET_HIGHLIGHT,
  SET_CURRENT_PAGE,
  SET_TOTAL_PAGES,
  SET_PDF_MODE
} from './actions';

// PDF 뷰어 관련 상태 리듀서
const initialPdfViewerState = {
  highlight: {
    term: '',
    page: null
  },
  currentPage: 1,
  totalPages: null,
  pdfMode: 'single' // 'single' 또는 'scroll'
};

const pdfViewerReducer = (state = initialPdfViewerState, action) => {
  switch (action.type) {
    case SET_HIGHLIGHT:
      return {
        ...state,
        highlight: {
          term: action.payload.term,
          page: action.payload.page
        }
      };
    case SET_CURRENT_PAGE:
      return {
        ...state,
        currentPage: action.payload
      };
    case SET_TOTAL_PAGES:
      return {
        ...state,
        totalPages: action.payload
      };
    case SET_PDF_MODE:
      return {
        ...state,
        pdfMode: action.payload
      };
    default:
      return state;
  }
};

// 루트 리듀서 - 애플리케이션이 확장될 경우 여러 리듀서를 통합
const rootReducer = combineReducers({
  pdfViewer: pdfViewerReducer
});

export default rootReducer; 
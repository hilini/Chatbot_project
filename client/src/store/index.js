import { createStore } from 'redux';
import rootReducer from './reducers';

// Redux 스토어 생성
const store = createStore(
  rootReducer,
  // Redux DevTools Extension 지원
  window.__REDUX_DEVTOOLS_EXTENSION__ && window.__REDUX_DEVTOOLS_EXTENSION__()
);

export default store; 
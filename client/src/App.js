import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import ChatInterface from './components/ChatInterface';
import TitleHeader from './components/TitleHeader';
import { useDispatch, useSelector } from 'react-redux';
import { setHighlight, setPdfMode } from './store/actions';
import { setCurrentPage } from './store/actions';
import './App.css';
import FileList from './components/FileList';
import FilePreview from './components/FilePreview';

function App() {
  // 기존 PDF 관련 state/handler 모두 제거
  const [selectedFile, setSelectedFile] = React.useState(null);
  
  return (
    <div style={{display:'flex', minHeight:'100vh'}}>
      <div style={{flex:'0 0 350px', borderRight:'1px solid #eee', background:'#fafbfc'}}>
        <FileList onFileSelect={setSelectedFile} />
      </div>
      <div style={{flex:'1 1 0', minWidth:0}}>
        <FilePreview file={selectedFile} />
      </div>
    </div>
  );
}

export default App; 
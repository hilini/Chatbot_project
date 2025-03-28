import React, { useState } from 'react';
import axios from 'axios';
import {
  Box,
  Button,
  CircularProgress,
  FormControl,
  FormLabel,
  Input,
  TextField,
  Typography,
  Paper,
  Snackbar,
  Alert,
  Divider,
  List,
  ListItem,
  ListItemText,
  Chip
} from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import SearchIcon from '@mui/icons-material/Search';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';

/**
 * PDF 업로더 및 RAG 검색 컴포넌트
 */
const PdfUploader = () => {
  // 상태 관리
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [category, setCategory] = useState('암 치료');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [openSnackbar, setOpenSnackbar] = useState(false);
  const [namespaces, setNamespaces] = useState([]);
  const [selectedNamespace, setSelectedNamespace] = useState('');
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);

  // 파일 선택 핸들러
  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile && selectedFile.type === 'application/pdf') {
      setFile(selectedFile);
      // 파일명에서 확장자를 제외한 이름을 타이틀로 사용
      if (!title) {
        const fileName = selectedFile.name.replace(/\.[^/.]+$/, "");
        setTitle(fileName);
      }
    } else {
      setMessage({ type: 'error', text: 'PDF 파일만 업로드 가능합니다.' });
      setOpenSnackbar(true);
    }
  };

  // PDF 업로드 핸들러
  const handleUpload = async () => {
    if (!file) {
      setMessage({ type: 'error', text: '업로드할 PDF 파일을 선택해주세요.' });
      setOpenSnackbar(true);
      return;
    }

    setLoading(true);
    const formData = new FormData();
    formData.append('pdfFile', file);
    formData.append('title', title);
    formData.append('author', author);
    formData.append('category', category);
    
    try {
      const response = await axios.post('/api/upload/pdf', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      
      if (response.data.success) {
        setMessage({ type: 'success', text: response.data.message });
        // 업로드 성공 후 폼 초기화
        setFile(null);
        setTitle('');
        setAuthor('');
        // 네임스페이스 리스트 다시 로드
        loadNamespaces();
      } else {
        setMessage({ type: 'error', text: response.data.message });
      }
    } catch (error) {
      console.error('PDF 업로드 오류:', error);
      setMessage({ 
        type: 'error', 
        text: error.response?.data?.message || '파일 업로드 중 오류가 발생했습니다.' 
      });
    } finally {
      setLoading(false);
      setOpenSnackbar(true);
    }
  };

  // 네임스페이스 목록 로드
  const loadNamespaces = async () => {
    try {
      const response = await axios.get('/api/namespaces');
      if (response.data.success) {
        setNamespaces(response.data.namespaces);
        if (response.data.namespaces.length > 0) {
          setSelectedNamespace(response.data.namespaces[0]);
        }
      }
    } catch (error) {
      console.error('네임스페이스 로드 오류:', error);
      setMessage({ 
        type: 'error', 
        text: '네임스페이스 목록을 불러오는 중 오류가 발생했습니다.' 
      });
      setOpenSnackbar(true);
    }
  };

  // 문서 검색 핸들러
  const handleSearch = async () => {
    if (!query.trim()) {
      setMessage({ type: 'error', text: '검색어를 입력해주세요.' });
      setOpenSnackbar(true);
      return;
    }

    setSearching(true);
    try {
      const response = await axios.post('/api/search/documents', {
        query: query,
        namespace: selectedNamespace,
        topK: 5
      });
      
      if (response.data.success) {
        setSearchResults(response.data.results);
        if (response.data.results.length === 0) {
          setMessage({ type: 'info', text: '검색 결과가 없습니다.' });
          setOpenSnackbar(true);
        }
      } else {
        setMessage({ type: 'error', text: response.data.message });
        setOpenSnackbar(true);
      }
    } catch (error) {
      console.error('문서 검색 오류:', error);
      setMessage({ 
        type: 'error', 
        text: error.response?.data?.message || '검색 중 오류가 발생했습니다.' 
      });
      setOpenSnackbar(true);
    } finally {
      setSearching(false);
    }
  };

  // 채팅에 RAG 검색 결과 전송
  const sendToChatAsRag = async (text) => {
    try {
      await axios.post('/api/chat', {
        message: text,
        useRag: true
      });
      
      setMessage({ type: 'success', text: '검색 결과가 채팅창으로 전송되었습니다.' });
      setOpenSnackbar(true);
    } catch (error) {
      console.error('채팅 전송 오류:', error);
      setMessage({ 
        type: 'error', 
        text: '채팅창으로 전송 중 오류가 발생했습니다.' 
      });
      setOpenSnackbar(true);
    }
  };
  
  // 컴포넌트 마운트 시 네임스페이스 목록 로드
  React.useEffect(() => {
    loadNamespaces();
  }, []);
  
  return (
    <Box sx={{ width: '100%', p: 2 }}>
      <Typography variant="h5" gutterBottom>
        PDF 관리 및 지식검색
      </Typography>
      
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          PDF 업로드
        </Typography>
        
        <Box sx={{ mb: 2 }}>
          <Button
            variant="contained"
            component="label"
            startIcon={<CloudUploadIcon />}
            sx={{ mb: 2 }}
          >
            PDF 파일 선택
            <input
              type="file"
              hidden
              accept="application/pdf"
              onChange={handleFileChange}
            />
          </Button>
          {file && (
            <Box sx={{ display: 'flex', alignItems: 'center', ml: 2 }}>
              <PictureAsPdfIcon color="primary" />
              <Typography variant="body2" sx={{ ml: 1 }}>
                {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
              </Typography>
            </Box>
          )}
        </Box>
        
        <FormControl fullWidth sx={{ mb: 2 }}>
          <FormLabel>문서 제목</FormLabel>
          <TextField
            size="small"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="PDF 문서의 제목을 입력하세요"
          />
        </FormControl>
        
        <FormControl fullWidth sx={{ mb: 2 }}>
          <FormLabel>저자</FormLabel>
          <TextField
            size="small"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            placeholder="문서 저자 정보를 입력하세요"
          />
        </FormControl>
        
        <FormControl fullWidth sx={{ mb: 2 }}>
          <FormLabel>카테고리</FormLabel>
          <TextField
            size="small"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="문서 카테고리를 입력하세요"
          />
        </FormControl>
        
        <Button
          variant="contained"
          color="primary"
          onClick={handleUpload}
          disabled={loading || !file}
          sx={{ mt: 1 }}
        >
          {loading ? <CircularProgress size={24} /> : '업로드'}
        </Button>
      </Paper>
      
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          문서 검색
        </Typography>
        
        <FormControl fullWidth sx={{ mb: 2 }}>
          <FormLabel>검색 네임스페이스</FormLabel>
          <TextField
            select
            size="small"
            value={selectedNamespace}
            onChange={(e) => setSelectedNamespace(e.target.value)}
            disabled={namespaces.length === 0}
            SelectProps={{
              native: true
            }}
          >
            {namespaces.length === 0 ? (
              <option value="">사용 가능한 네임스페이스가 없습니다</option>
            ) : (
              namespaces.map((ns) => (
                <option key={ns} value={ns}>{ns}</option>
              ))
            )}
          </TextField>
        </FormControl>
        
        <FormControl fullWidth sx={{ mb: 2 }}>
          <FormLabel>검색어</FormLabel>
          <TextField
            size="small"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="검색할 내용을 입력하세요"
            onKeyPress={(e) => {
              if (e.key === 'Enter') {
                handleSearch();
              }
            }}
          />
        </FormControl>
        
        <Button
          variant="contained"
          color="primary"
          onClick={handleSearch}
          disabled={searching || !query || namespaces.length === 0}
          startIcon={<SearchIcon />}
          sx={{ mt: 1 }}
        >
          {searching ? <CircularProgress size={24} /> : '검색'}
        </Button>
        
        {searchResults.length > 0 && (
          <Box sx={{ mt: 3 }}>
            <Divider />
            <Typography variant="subtitle1" sx={{ mt: 2, mb: 1 }}>
              검색 결과 ({searchResults.length}건)
            </Typography>
            
            <List>
              {searchResults.map((result, index) => (
                <ListItem 
                  key={index} 
                  alignItems="flex-start"
                  sx={{ 
                    bgcolor: 'background.paper', 
                    mb: 1,
                    borderRadius: 1,
                    border: '1px solid',
                    borderColor: 'divider'
                  }}
                >
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography variant="subtitle2">
                          청크 #{result.metadata.index + 1}
                        </Typography>
                        <Box>
                          <Chip 
                            label={result.metadata.source}
                            size="small"
                            color="primary"
                            variant="outlined"
                            sx={{ mr: 1 }}
                          />
                          <Button 
                            size="small" 
                            variant="outlined"
                            onClick={() => sendToChatAsRag(result.pageContent)}
                          >
                            채팅에 사용
                          </Button>
                        </Box>
                      </Box>
                    }
                    secondary={
                      <React.Fragment>
                        <Typography
                          component="span"
                          variant="body2"
                          color="text.primary"
                          sx={{ 
                            display: 'block', 
                            mt: 1,
                            p: 1,
                            bgcolor: 'action.hover',
                            borderRadius: 1,
                            maxHeight: '150px',
                            overflow: 'auto'
                          }}
                        >
                          {result.pageContent}
                        </Typography>
                        <Typography variant="caption" sx={{ mt: 1, display: 'block' }}>
                          제목: {result.metadata.title} | 
                          저자: {result.metadata.author} | 
                          카테고리: {result.metadata.category}
                        </Typography>
                      </React.Fragment>
                    }
                  />
                </ListItem>
              ))}
            </List>
          </Box>
        )}
      </Paper>
      
      <Snackbar
        open={openSnackbar}
        autoHideDuration={6000}
        onClose={() => setOpenSnackbar(false)}
      >
        <Alert 
          onClose={() => setOpenSnackbar(false)} 
          severity={message.type || 'info'} 
          sx={{ width: '100%' }}
        >
          {message.text}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default PdfUploader; 
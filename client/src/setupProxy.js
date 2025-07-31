const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  app.use(
    ['/api', '/files', '/favicon.ico', '/logo192.png'],
    createProxyMiddleware({
      target: 'http://localhost:3001',
      changeOrigin: true,
      pathRewrite: {
        '^/api': '/api',
        '^/files': '/files',
      },
      onError: (err, req, res) => {
        console.log('Proxy error:', err);
        res.writeHead(500, {
          'Content-Type': 'text/plain',
        });
        res.end('Proxy error: Cannot connect to the server. Server might be down or unavailable.');
      }
    })
  );
}; 
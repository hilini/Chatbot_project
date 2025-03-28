const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  app.use(
    ['/api', '/cancer_treatment_guidelines.pdf', '/favicon.ico', '/logo192.png'],
    createProxyMiddleware({
      target: 'http://10.10.10.103:3001',
      changeOrigin: true,
      pathRewrite: {
        '^/api': '/api', // no rewrite needed, just for clarity
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
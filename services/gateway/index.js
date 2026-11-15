const express = require('express');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const { createProxyMiddleware } = require('http-proxy-middleware');

const PORT = process.env.PORT || 3000;
const FILES_URL = process.env.FILES_URL || 'http://localhost:3001';
const ACTIVITY_URL = process.env.ACTIVITY_URL || 'http://localhost:3002';
const CLIENT_DIST = path.join(__dirname, '..', '..', 'client', 'dist');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

io.on('connection', (socket) => {
  console.log('klient połączony', socket.id);
});

const unavailable = (service) => (err, req, res) => {
  res.writeHead(502, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: `${service} niedostępny` }));
};

app.use(
  createProxyMiddleware({
    target: ACTIVITY_URL,
    pathFilter: '/api/activity',
    pathRewrite: { '^/api/activity': '/activity' },
    on: { error: unavailable('activity-service') },
  })
);

app.use(
  createProxyMiddleware({
    target: FILES_URL,
    pathFilter: '/api',
    on: {
      // udana zmiana w plikach -> wszystkie otwarte karty odświeżają widok
      proxyRes: (proxyRes, req) => {
        if (req.method !== 'GET' && proxyRes.statusCode < 400) {
          io.emit('changed');
        }
      },
      error: unavailable('files-service'),
    },
  })
);

// zbudowany frontend (npm run build); każdy inny adres -> index.html (SPA)
app.use(express.static(CLIENT_DIST));
app.get('*', (req, res) => {
  const index = path.join(CLIENT_DIST, 'index.html');
  if (!fs.existsSync(index)) {
    return res
      .status(503)
      .send('Brak zbudowanego frontendu - uruchom "npm run build".');
  }
  res.sendFile(index);
});

server.listen(PORT, () => {
  console.log(`gateway: http://localhost:${PORT}`);
});

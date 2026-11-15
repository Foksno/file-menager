const express = require('express');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { userFromCookieHeader } = require('../shared/auth');

const PORT = process.env.PORT || 3000;
const FILES_URL = process.env.FILES_URL || 'http://localhost:3001';
const ACTIVITY_URL = process.env.ACTIVITY_URL || 'http://localhost:3002';
const AUTH_URL = process.env.AUTH_URL || 'http://localhost:3003';
const CLIENT_DIST = path.join(__dirname, '..', '..', 'client', 'dist');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const room = (userId) => `user:${userId}`;

// WebSocket tylko dla zalogowanych; każdy użytkownik dostaje powiadomienia o swoich plikach
io.use((socket, next) => {
  const user = userFromCookieHeader(socket.request.headers.cookie);
  if (!user) return next(new Error('unauthorized'));
  socket.data.user = user;
  next();
});

io.on('connection', (socket) => {
  socket.join(room(socket.data.user.id));
  console.log('klient połączony', socket.id, socket.data.user.login);
});

const unavailable = (service) => (err, req, res) => {
  res.writeHead(502, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: `${service} niedostępny` }));
};

app.use(
  createProxyMiddleware({
    target: AUTH_URL,
    pathFilter: '/api/auth',
    pathRewrite: { '^/api/auth': '/auth' },
    on: { error: unavailable('auth-service') },
  })
);

// z zewnątrz historię można tylko czytać - zapisuje ją wyłącznie files-service
app.use('/api/activity', (req, res, next) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Niedozwolona metoda' });
  next();
});

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
      // udana zmiana -> odświeżają się wszystkie otwarte karty tego samego użytkownika
      proxyRes: (proxyRes, req) => {
        if (req.method === 'GET' || proxyRes.statusCode >= 400) return;
        const user = userFromCookieHeader(req.headers.cookie);
        if (user) io.to(room(user.id)).emit('changed');
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

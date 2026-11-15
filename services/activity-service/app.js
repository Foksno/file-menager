const express = require('express');

const LIMIT = 50;

function createApp() {
  const app = express();
  app.use(express.json());

  // historia trzymana w pamięci - po restarcie serwisu jest pusta
  const events = [];

  app.get('/activity', (req, res) => {
    res.json(events);
  });

  app.post('/activity', (req, res) => {
    const { action, path = '', name = '', newName } = req.body || {};
    if (typeof action !== 'string' || !action) {
      return res.status(400).json({ error: 'Brak pola action' });
    }
    const event = { action, path, name, time: new Date().toISOString() };
    if (newName) event.newName = newName;
    events.unshift(event);
    events.length = Math.min(events.length, LIMIT);
    res.status(201).json(event);
  });

  return app;
}

module.exports = { createApp };

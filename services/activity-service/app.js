const express = require('express');
const { requireUser } = require('../shared/auth');

const LIMIT = 50;

function createApp() {
  const app = express();
  app.use(express.json());

  // historia trzymana w pamięci, osobno dla każdego użytkownika - po restarcie jest pusta
  const eventsByUser = new Map();

  // odczyt przez gateway - tylko własna historia zalogowanego użytkownika
  app.get('/activity', requireUser, (req, res) => {
    res.json(eventsByUser.get(req.user.id) ?? []);
  });

  // zapis tylko od files-service (gateway nie przepuszcza POST-ów z zewnątrz)
  app.post('/activity', (req, res) => {
    const { userId, action, path = '', name = '', newName } = req.body || {};
    if (!Number.isInteger(userId)) {
      return res.status(400).json({ error: 'Brak pola userId' });
    }
    if (typeof action !== 'string' || !action) {
      return res.status(400).json({ error: 'Brak pola action' });
    }
    const event = { action, path, name, time: new Date().toISOString() };
    if (newName) event.newName = newName;
    const events = eventsByUser.get(userId) ?? [];
    events.unshift(event);
    events.length = Math.min(events.length, LIMIT);
    eventsByUser.set(userId, events);
    res.status(201).json(event);
  });

  return app;
}

module.exports = { createApp };

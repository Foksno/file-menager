// tylko dla testów: PostgreSQL w pamięci (pg-mem) z tym samym schematem co produkcja
const { newDb } = require('pg-mem');
const { SCHEMA } = require('./db');
const { signToken } = require('./auth');

function createTestDb() {
  const mem = newDb();
  mem.public.none(SCHEMA);
  const { Pool } = mem.adapters.createPg();
  return new Pool();
}

// zakłada użytkownika i zwraca nagłówek Cookie z jego sesją
async function createUser(db, login) {
  const { rows } = await db.query(
    "INSERT INTO users (login, password_hash) VALUES ($1, 'x') RETURNING id, login",
    [login]
  );
  return { user: rows[0], cookie: `token=${signToken(rows[0])}` };
}

module.exports = { createTestDb, createUser };

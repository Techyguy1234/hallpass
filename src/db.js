'use strict';

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'hallpass.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema(db);
  }
  return db;
}

function initSchema(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'teacher', 'student')),
      display_name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS locations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      max_occupancy INTEGER NOT NULL DEFAULT 3,
      active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS passes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES users(id),
      teacher_id INTEGER NOT NULL REFERENCES users(id),
      location_id INTEGER NOT NULL REFERENCES locations(id),
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'returned', 'expired')),
      notes TEXT,
      issued_at TEXT NOT NULL DEFAULT (datetime('now')),
      returned_at TEXT,
      expected_duration_minutes INTEGER NOT NULL DEFAULT 10
    );

    CREATE INDEX IF NOT EXISTS idx_passes_student ON passes(student_id);
    CREATE INDEX IF NOT EXISTS idx_passes_status ON passes(status);
    CREATE INDEX IF NOT EXISTS idx_passes_location ON passes(location_id, status);
  `);

  seedDefaults(database);
}

function seedDefaults(database) {
  const bcrypt = require('bcryptjs');

  // Seed default locations if none exist
  const locationCount = database.prepare('SELECT COUNT(*) as cnt FROM locations').get().cnt;
  if (locationCount === 0) {
    const insertLocation = database.prepare(
      'INSERT INTO locations (name, max_occupancy) VALUES (?, ?)'
    );
    const defaultLocations = [
      ['Bathroom - Main Hall', 2],
      ['Bathroom - Gym Wing', 2],
      ['Nurse', 1],
      ['Main Office', 2],
      ['Library', 5],
      ['Water Fountain', 3],
      ['Counselor', 1],
    ];
    for (const [name, max] of defaultLocations) {
      insertLocation.run(name, max);
    }
  }

  // Seed default admin if no users exist
  const userCount = database.prepare('SELECT COUNT(*) as cnt FROM users').get().cnt;
  if (userCount === 0) {
    const hash = bcrypt.hashSync('admin123', 10);
    database
      .prepare(
        'INSERT INTO users (username, password_hash, role, display_name) VALUES (?, ?, ?, ?)'
      )
      .run('admin', hash, 'admin', 'Administrator');
  }
}

function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = { getDb, closeDb };

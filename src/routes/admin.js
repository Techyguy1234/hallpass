'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const { getDb } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth, requireRole('admin'));

// GET /api/admin/users - list all users
router.get('/users', (req, res) => {
  const db = getDb();
  const users = db
    .prepare('SELECT id, username, role, display_name, created_at FROM users ORDER BY role, display_name')
    .all();
  return res.json(users);
});

// GET /api/admin/users/:id
router.get('/users/:id', (req, res) => {
  const db = getDb();
  const user = db
    .prepare('SELECT id, username, role, display_name, created_at FROM users WHERE id = ?')
    .get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  return res.json(user);
});

// POST /api/admin/users - create user
router.post('/users', (req, res) => {
  const { username, password, role, display_name } = req.body || {};
  if (!username || !password || !role || !display_name) {
    return res.status(400).json({ error: 'All fields required' });
  }
  const validRoles = ['admin', 'teacher', 'student'];
  if (!validRoles.includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  const db = getDb();
  if (db.prepare('SELECT id FROM users WHERE username = ?').get(username.trim())) {
    return res.status(409).json({ error: 'Username already taken' });
  }

  const hash = bcrypt.hashSync(password, 10);
  const result = db
    .prepare('INSERT INTO users (username, password_hash, role, display_name) VALUES (?, ?, ?, ?)')
    .run(username.trim(), hash, role, display_name.trim());

  return res.status(201).json({ id: result.lastInsertRowid, username: username.trim(), role, display_name: display_name.trim() });
});

// PATCH /api/admin/users/:id - update user role or display name
router.patch('/users/:id', (req, res) => {
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const { display_name, role, password } = req.body || {};
  const newName = display_name !== undefined ? display_name.trim() : user.display_name;
  const newRole = role !== undefined ? role : user.role;
  const validRoles = ['admin', 'teacher', 'student'];
  if (!validRoles.includes(newRole)) {
    return res.status(400).json({ error: 'Invalid role' });
  }

  if (password !== undefined) {
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    const hash = bcrypt.hashSync(password, 10);
    db.prepare('UPDATE users SET display_name = ?, role = ?, password_hash = ? WHERE id = ?').run(
      newName, newRole, hash, req.params.id
    );
  } else {
    db.prepare('UPDATE users SET display_name = ?, role = ? WHERE id = ?').run(
      newName, newRole, req.params.id
    );
  }

  return res.json({ id: user.id, username: user.username, role: newRole, display_name: newName });
});

// DELETE /api/admin/users/:id
router.delete('/users/:id', (req, res) => {
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  // Prevent deleting the last admin
  if (user.role === 'admin') {
    const adminCount = db.prepare("SELECT COUNT(*) as cnt FROM users WHERE role = 'admin'").get().cnt;
    if (adminCount <= 1) {
      return res.status(409).json({ error: 'Cannot delete the last admin account' });
    }
  }

  // Prevent deleting users with active passes
  const activePass = db.prepare("SELECT id FROM passes WHERE (student_id = ? OR teacher_id = ?) AND status = 'active'").get(req.params.id, req.params.id);
  if (activePass) {
    return res.status(409).json({ error: 'Cannot delete user with active passes' });
  }

  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  return res.status(204).end();
});

// GET /api/admin/report - pass history with filters
router.get('/report', (req, res) => {
  const db = getDb();
  const { start_date, end_date, student_id, teacher_id, location_id, status } = req.query;

  let query = `
    SELECT p.*,
           s.display_name as student_name, s.username as student_username,
           t.display_name as teacher_name,
           l.name as location_name
    FROM passes p
    JOIN users s ON s.id = p.student_id
    JOIN users t ON t.id = p.teacher_id
    JOIN locations l ON l.id = p.location_id
    WHERE 1=1
  `;
  const params = [];

  if (start_date) { query += ' AND date(p.issued_at) >= ?'; params.push(start_date); }
  if (end_date) { query += ' AND date(p.issued_at) <= ?'; params.push(end_date); }
  if (student_id) { query += ' AND p.student_id = ?'; params.push(student_id); }
  if (teacher_id) { query += ' AND p.teacher_id = ?'; params.push(teacher_id); }
  if (location_id) { query += ' AND p.location_id = ?'; params.push(location_id); }
  if (status) { query += ' AND p.status = ?'; params.push(status); }

  query += ' ORDER BY p.issued_at DESC LIMIT 500';

  const rows = db.prepare(query).all(...params);
  return res.json(rows);
});

module.exports = router;

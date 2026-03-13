'use strict';

const express = require('express');
const { getDb } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

// GET /api/passes - list passes (filtered by role)
router.get('/', (req, res) => {
  const db = getDb();
  const { status, student_id } = req.query;

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

  // Students can only see their own passes
  if (req.user.role === 'student') {
    query += ' AND p.student_id = ?';
    params.push(req.user.id);
  } else if (req.user.role === 'teacher') {
    // Teachers see passes they issued
    query += ' AND p.teacher_id = ?';
    params.push(req.user.id);
  }

  if (status) {
    query += ' AND p.status = ?';
    params.push(status);
  }
  if (student_id && req.user.role !== 'student') {
    query += ' AND p.student_id = ?';
    params.push(student_id);
  }

  query += ' ORDER BY p.issued_at DESC';

  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 500);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
  query += ' LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const passes = db.prepare(query).all(...params);
  return res.json(passes);
});

// GET /api/passes/active - all currently active passes (admin/teacher)
router.get('/active', requireRole('admin', 'teacher'), (req, res) => {
  const db = getDb();
  const passes = db
    .prepare(
      `SELECT p.*,
              s.display_name as student_name, s.username as student_username,
              t.display_name as teacher_name,
              l.name as location_name
       FROM passes p
       JOIN users s ON s.id = p.student_id
       JOIN users t ON t.id = p.teacher_id
       JOIN locations l ON l.id = p.location_id
       WHERE p.status = 'active'
       ORDER BY p.issued_at ASC`
    )
    .all();
  return res.json(passes);
});

// POST /api/passes - issue a pass (teacher or admin)
router.post('/', requireRole('admin', 'teacher'), (req, res) => {
  const { student_id, location_id, notes, expected_duration_minutes } = req.body || {};
  if (!student_id || !location_id) {
    return res.status(400).json({ error: 'student_id and location_id are required' });
  }

  const db = getDb();

  // Verify student exists and has role 'student'
  const student = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'student'").get(student_id);
  if (!student) {
    return res.status(404).json({ error: 'Student not found' });
  }

  // Check student doesn't already have an active pass
  const existingPass = db
    .prepare("SELECT id FROM passes WHERE student_id = ? AND status = 'active'")
    .get(student_id);
  if (existingPass) {
    return res.status(409).json({ error: 'Student already has an active pass' });
  }

  // Verify location exists and is active
  const location = db.prepare('SELECT * FROM locations WHERE id = ? AND active = 1').get(location_id);
  if (!location) {
    return res.status(404).json({ error: 'Location not found or inactive' });
  }

  // Check location occupancy limit
  const occupancy = db
    .prepare("SELECT COUNT(*) as cnt FROM passes WHERE location_id = ? AND status = 'active'")
    .get(location_id);
  if (occupancy.cnt >= location.max_occupancy) {
    return res.status(409).json({
      error: `${location.name} is at capacity (${location.max_occupancy} max). Cannot issue pass.`,
    });
  }

  const duration = parseInt(expected_duration_minutes, 10) || 10;
  const result = db
    .prepare(
      `INSERT INTO passes (student_id, teacher_id, location_id, notes, expected_duration_minutes)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(student_id, req.user.id, location_id, notes || null, duration);

  const pass = db
    .prepare(
      `SELECT p.*, 
              s.display_name as student_name,
              t.display_name as teacher_name,
              l.name as location_name
       FROM passes p
       JOIN users s ON s.id = p.student_id
       JOIN users t ON t.id = p.teacher_id
       JOIN locations l ON l.id = p.location_id
       WHERE p.id = ?`
    )
    .get(result.lastInsertRowid);

  return res.status(201).json(pass);
});

// PATCH /api/passes/:id/return - mark pass as returned
router.patch('/:id/return', (req, res) => {
  const db = getDb();
  const pass = db.prepare('SELECT * FROM passes WHERE id = ?').get(req.params.id);
  if (!pass) {
    return res.status(404).json({ error: 'Pass not found' });
  }
  if (pass.status !== 'active') {
    return res.status(409).json({ error: 'Pass is not active' });
  }

  // Students can only return their own pass; teachers/admins can return any
  if (req.user.role === 'student' && pass.student_id !== req.user.id) {
    return res.status(403).json({ error: 'You can only return your own pass' });
  }

  db.prepare(
    "UPDATE passes SET status = 'returned', returned_at = datetime('now') WHERE id = ?"
  ).run(req.params.id);

  return res.json({ id: pass.id, status: 'returned' });
});

// PATCH /api/passes/:id/expire - mark pass as expired (admin/teacher)
router.patch('/:id/expire', requireRole('admin', 'teacher'), (req, res) => {
  const db = getDb();
  const pass = db.prepare('SELECT * FROM passes WHERE id = ?').get(req.params.id);
  if (!pass) {
    return res.status(404).json({ error: 'Pass not found' });
  }
  if (pass.status !== 'active') {
    return res.status(409).json({ error: 'Pass is not active' });
  }

  db.prepare(
    "UPDATE passes SET status = 'expired', returned_at = datetime('now') WHERE id = ?"
  ).run(req.params.id);

  return res.json({ id: pass.id, status: 'expired' });
});

// GET /api/passes/stats - summary statistics (admin/teacher)
router.get('/stats', requireRole('admin', 'teacher'), (req, res) => {
  const db = getDb();
  const activeCount = db
    .prepare("SELECT COUNT(*) as cnt FROM passes WHERE status = 'active'")
    .get().cnt;
  const todayCount = db
    .prepare(
      "SELECT COUNT(*) as cnt FROM passes WHERE date(issued_at) = date('now')"
    )
    .get().cnt;
  const locationStats = db
    .prepare(
      `SELECT l.name, l.max_occupancy,
              COUNT(p.id) as current_occupancy
       FROM locations l
       LEFT JOIN passes p ON p.location_id = l.id AND p.status = 'active'
       WHERE l.active = 1
       GROUP BY l.id
       ORDER BY current_occupancy DESC`
    )
    .all();

  return res.json({ active_passes: activeCount, passes_today: todayCount, locations: locationStats });
});

module.exports = router;

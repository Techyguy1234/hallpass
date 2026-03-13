'use strict';

const express = require('express');
const { getDb } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// All location routes require authentication
router.use(requireAuth);

// GET /api/locations - list all active locations with current occupancy
router.get('/', (req, res) => {
  const db = getDb();
  const locations = db
    .prepare(
      `SELECT l.id, l.name, l.max_occupancy, l.active,
              COUNT(p.id) as current_occupancy
       FROM locations l
       LEFT JOIN passes p ON p.location_id = l.id AND p.status = 'active'
       WHERE l.active = 1
       GROUP BY l.id
       ORDER BY l.name`
    )
    .all();
  return res.json(locations);
});

// POST /api/locations - create location (admin only)
router.post('/', requireRole('admin'), (req, res) => {
  const { name, max_occupancy } = req.body || {};
  if (!name) {
    return res.status(400).json({ error: 'Location name is required' });
  }
  const max = parseInt(max_occupancy, 10) || 3;
  if (max < 1) {
    return res.status(400).json({ error: 'max_occupancy must be at least 1' });
  }

  const db = getDb();
  try {
    const result = db
      .prepare('INSERT INTO locations (name, max_occupancy) VALUES (?, ?)')
      .run(name.trim(), max);
    return res.status(201).json({ id: result.lastInsertRowid, name: name.trim(), max_occupancy: max, active: 1 });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'A location with that name already exists' });
    }
    throw err;
  }
});

// PATCH /api/locations/:id - update location (admin only)
router.patch('/:id', requireRole('admin'), (req, res) => {
  const db = getDb();
  const location = db.prepare('SELECT * FROM locations WHERE id = ?').get(req.params.id);
  if (!location) {
    return res.status(404).json({ error: 'Location not found' });
  }

  const { name, max_occupancy, active } = req.body || {};
  const newName = name !== undefined ? name.trim() : location.name;
  const newMax = max_occupancy !== undefined ? parseInt(max_occupancy, 10) : location.max_occupancy;
  const newActive = active !== undefined ? (active ? 1 : 0) : location.active;

  if (newMax < 1) {
    return res.status(400).json({ error: 'max_occupancy must be at least 1' });
  }

  db.prepare('UPDATE locations SET name = ?, max_occupancy = ?, active = ? WHERE id = ?').run(
    newName,
    newMax,
    newActive,
    req.params.id
  );

  return res.json({ id: location.id, name: newName, max_occupancy: newMax, active: newActive });
});

module.exports = router;

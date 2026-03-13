'use strict';

const express = require('express');
const { getDb } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

// GET /api/users/students - list all students (for teacher pass-issuing UI)
router.get('/students', requireRole('admin', 'teacher'), (req, res) => {
  const db = getDb();
  const students = db
    .prepare(
      "SELECT id, username, display_name FROM users WHERE role = 'student' ORDER BY display_name"
    )
    .all();
  return res.json(students);
});

module.exports = router;

'use strict';

const request = require('supertest');
const path = require('path');
const fs = require('fs');

// Use an isolated test database
process.env.DB_PATH = path.join('/tmp', `hallpass-test-${Date.now()}.db`);

const app = require('../src/app');
const { closeDb } = require('../src/db');

let adminToken;
let teacherToken;
let studentToken;
let studentId;
let teacherId;
let locationId;

afterAll(() => {
  closeDb();
  try { fs.unlinkSync(process.env.DB_PATH); } catch {}
});

// ─── Auth ────────────────────────────────────────────────────────────────────

describe('Auth', () => {
  test('login as default admin succeeds', async () => {
    const res = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'admin123' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.role).toBe('admin');
    adminToken = res.body.token;
  });

  test('login with wrong password fails', async () => {
    const res = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'wrong' });
    expect(res.status).toBe(401);
  });

  test('register without credentials fails', async () => {
    const res = await request(app).post('/api/auth/register').send({});
    expect(res.status).toBe(400);
  });

  test('register a new teacher', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'teacher1', password: 'pass123', role: 'teacher', display_name: 'Ms. Smith' });
    expect(res.status).toBe(201);
    expect(res.body.role).toBe('teacher');
    teacherId = res.body.id;
  });

  test('login as new teacher', async () => {
    const res = await request(app).post('/api/auth/login').send({ username: 'teacher1', password: 'pass123' });
    expect(res.status).toBe(200);
    teacherToken = res.body.token;
  });

  test('duplicate username rejected', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'teacher1', password: 'pass123', role: 'teacher', display_name: 'Duplicate' });
    expect(res.status).toBe(409);
  });
});

// ─── Admin User Management ────────────────────────────────────────────────────

describe('Admin: User Management', () => {
  test('create a student via admin endpoint', async () => {
    const res = await request(app)
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ username: 'student1', password: 'pass123', role: 'student', display_name: 'Alice Johnson' });
    expect(res.status).toBe(201);
    studentId = res.body.id;

    const loginRes = await request(app).post('/api/auth/login').send({ username: 'student1', password: 'pass123' });
    studentToken = loginRes.body.token;
  });

  test('teacher cannot access admin/users endpoint', async () => {
    const res = await request(app)
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${teacherToken}`);
    expect(res.status).toBe(403);
  });

  test('list all users as admin', async () => {
    const res = await request(app)
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(3);
  });

  test('update user display name', async () => {
    const res = await request(app)
      .patch(`/api/admin/users/${studentId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ display_name: 'Alice Johnson Updated' });
    expect(res.status).toBe(200);
    expect(res.body.display_name).toBe('Alice Johnson Updated');
  });
});

// ─── Locations ────────────────────────────────────────────────────────────────

describe('Locations', () => {
  test('list locations (authenticated user)', async () => {
    const res = await request(app)
      .get('/api/locations')
      .set('Authorization', `Bearer ${teacherToken}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    locationId = res.body[0].id;
  });

  test('add a location as admin', async () => {
    const res = await request(app)
      .post('/api/locations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Test Room', max_occupancy: 3 });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Test Room');
    locationId = res.body.id;
  });

  test('teacher cannot add a location', async () => {
    const res = await request(app)
      .post('/api/locations')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ name: 'Teacher Room', max_occupancy: 2 });
    expect(res.status).toBe(403);
  });

  test('duplicate location name rejected', async () => {
    const res = await request(app)
      .post('/api/locations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Test Room', max_occupancy: 1 });
    expect(res.status).toBe(409);
  });

  test('update location max_occupancy', async () => {
    const res = await request(app)
      .patch(`/api/locations/${locationId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ max_occupancy: 5 });
    expect(res.status).toBe(200);
    expect(res.body.max_occupancy).toBe(5);
  });
});

// ─── Passes ──────────────────────────────────────────────────────────────────

let passId;

describe('Passes', () => {
  test('issue a pass as teacher', async () => {
    const res = await request(app)
      .post('/api/passes')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ student_id: studentId, location_id: locationId, expected_duration_minutes: 5 });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('active');
    expect(res.body.student_name).toBeDefined();
    passId = res.body.id;
  });

  test('student cannot issue a pass', async () => {
    const res = await request(app)
      .post('/api/passes')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ student_id: studentId, location_id: locationId });
    expect(res.status).toBe(403);
  });

  test('cannot issue duplicate active pass for same student', async () => {
    const res = await request(app)
      .post('/api/passes')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ student_id: studentId, location_id: locationId });
    expect(res.status).toBe(409);
  });

  test('student can view their own active passes', async () => {
    const res = await request(app)
      .get('/api/passes?status=active')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].id).toBe(passId);
  });

  test('get active passes list (teacher)', async () => {
    const res = await request(app)
      .get('/api/passes/active')
      .set('Authorization', `Bearer ${teacherToken}`);
    expect(res.status).toBe(200);
    expect(res.body.some(p => p.id === passId)).toBe(true);
  });

  test('get pass stats (teacher)', async () => {
    const res = await request(app)
      .get('/api/passes/stats')
      .set('Authorization', `Bearer ${teacherToken}`);
    expect(res.status).toBe(200);
    expect(res.body.active_passes).toBeGreaterThanOrEqual(1);
    expect(res.body.passes_today).toBeGreaterThanOrEqual(1);
  });

  test('student can return their own pass', async () => {
    const res = await request(app)
      .patch(`/api/passes/${passId}/return`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('returned');
  });

  test('cannot return an already-returned pass', async () => {
    const res = await request(app)
      .patch(`/api/passes/${passId}/return`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({});
    expect(res.status).toBe(409);
  });

  test('issue a new pass and expire it as admin', async () => {
    const issueRes = await request(app)
      .post('/api/passes')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ student_id: studentId, location_id: locationId, expected_duration_minutes: 10 });
    expect(issueRes.status).toBe(201);
    const newPassId = issueRes.body.id;

    const expireRes = await request(app)
      .patch(`/api/passes/${newPassId}/expire`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});
    expect(expireRes.status).toBe(200);
    expect(expireRes.body.status).toBe('expired');
  });
});

// ─── Location Capacity Enforcement ────────────────────────────────────────────

describe('Location Capacity', () => {
  test('cannot issue pass when location is at max capacity', async () => {
    // Create a tight-capacity location
    const locRes = await request(app)
      .post('/api/locations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Tiny Room', max_occupancy: 1 });
    const tinyLocId = locRes.body.id;

    // Create two students
    await request(app).post('/api/auth/register').send({ username: 'stud2', password: 'pass123', role: 'student', display_name: 'Bob' });
    await request(app).post('/api/auth/register').send({ username: 'stud3', password: 'pass123', role: 'student', display_name: 'Carol' });

    const loginBob = await request(app).post('/api/auth/login').send({ username: 'stud2', password: 'pass123' });
    const loginCarol = await request(app).post('/api/auth/login').send({ username: 'stud3', password: 'pass123' });
    const bobId = loginBob.body.user.id;
    const carolId = loginCarol.body.user.id;

    // Issue pass for Bob → should succeed
    const r1 = await request(app)
      .post('/api/passes')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ student_id: bobId, location_id: tinyLocId });
    expect(r1.status).toBe(201);

    // Issue pass for Carol to same location → should fail (full)
    const r2 = await request(app)
      .post('/api/passes')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ student_id: carolId, location_id: tinyLocId });
    expect(r2.status).toBe(409);
    expect(r2.body.error).toMatch(/capacity/i);
  });
});

// ─── Admin Reports ────────────────────────────────────────────────────────────

describe('Admin Reports', () => {
  test('get report as admin', async () => {
    const res = await request(app)
      .get('/api/admin/report')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('get report filtered by status', async () => {
    const res = await request(app)
      .get('/api/admin/report?status=returned')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.every(p => p.status === 'returned')).toBe(true);
  });

  test('student cannot access reports', async () => {
    const res = await request(app)
      .get('/api/admin/report')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(res.status).toBe(403);
  });
});

// ─── Unauthenticated access ───────────────────────────────────────────────────

describe('Unauthenticated access', () => {
  test('cannot get passes without token', async () => {
    const res = await request(app).get('/api/passes');
    expect(res.status).toBe(401);
  });

  test('cannot get locations without token', async () => {
    const res = await request(app).get('/api/locations');
    expect(res.status).toBe(401);
  });
});

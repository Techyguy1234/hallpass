'use strict';

// ─── API helpers ────────────────────────────────────────────────────────────

const API_BASE = '/api';

function getToken() { return localStorage.getItem('hp_token'); }
function getUser()  { return JSON.parse(localStorage.getItem('hp_user') || 'null'); }
function saveAuth(token, user) {
  localStorage.setItem('hp_token', token);
  localStorage.setItem('hp_user', JSON.stringify(user));
}
function clearAuth() {
  localStorage.removeItem('hp_token');
  localStorage.removeItem('hp_user');
}

async function api(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(API_BASE + path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'Request failed'), { status: res.status });
  return data;
}

const GET    = (p)    => api('GET',    p);
const POST   = (p, b) => api('POST',   p, b);
const PATCH  = (p, b) => api('PATCH',  p, b);
const DELETE = (p)    => api('DELETE', p);

// ─── Router (simple hash-based) ────────────────────────────────────────────

function route() {
  const user = getUser();
  if (!user) { renderLogin(); return; }
  switch (user.role) {
    case 'admin':   renderAdmin();   break;
    case 'teacher': renderTeacher(); break;
    case 'student': renderStudent(); break;
    default: clearAuth(); renderLogin();
  }
}

window.addEventListener('load', route);

// ─── Utilities ───────────────────────────────────────────────────────────────

function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function timeSince(iso) {
  const secs = Math.floor((Date.now() - new Date(iso + 'Z').getTime()) / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m ago`;
}

function formatTime(iso) {
  if (!iso) return '—';
  return new Date(iso + 'Z').toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function showAlert(id, msg, type = 'error') {
  const el = document.getElementById(id);
  if (!el) return;
  el.className = `alert alert-${type}`;
  el.textContent = msg;
  el.classList.remove('hidden');
  if (type !== 'error') setTimeout(() => el.classList.add('hidden'), 4000);
}

function navBar(displayName, role) {
  return `
    <nav>
      <div class="logo">HallPass <span>— ${escHtml(role)}</span></div>
      <div class="nav-right">
        <span class="user-badge">${escHtml(displayName)}</span>
        <button class="logout" onclick="logout()">Sign out</button>
      </div>
    </nav>`;
}

function logout() { clearAuth(); renderLogin(); }

// ─── LOGIN ────────────────────────────────────────────────────────────────────

function renderLogin() {
  document.getElementById('app').innerHTML = `
    <div class="login-wrap">
      <div class="login-card">
        <h1>🎫 HallPass</h1>
        <p class="subtitle">Digital hall pass management</p>
        <div id="login-alert" class="alert alert-error hidden"></div>
        <form id="login-form">
          <div class="form-group">
            <label for="l-user">Username</label>
            <input id="l-user" type="text" autocomplete="username" required>
          </div>
          <div class="form-group">
            <label for="l-pass">Password</label>
            <input id="l-pass" type="password" autocomplete="current-password" required>
          </div>
          <button type="submit" class="btn btn-primary" style="width:100%">Sign in</button>
        </form>
      </div>
    </div>`;

  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('l-user').value.trim();
    const password = document.getElementById('l-pass').value;
    try {
      const data = await POST('/auth/login', { username, password });
      saveAuth(data.token, data.user);
      route();
    } catch (err) {
      showAlert('login-alert', err.message);
    }
  });
}

// ─── STUDENT VIEW ─────────────────────────────────────────────────────────────

async function renderStudent() {
  const user = getUser();
  document.getElementById('app').innerHTML = `
    ${navBar(user.display_name, 'Student')}
    <main id="main">
      <div id="alert" class="alert hidden"></div>
      <div id="student-content">Loading…</div>
    </main>`;
  await loadStudentContent();
}

async function loadStudentContent() {
  const container = document.getElementById('student-content');
  try {
    const [passes, locations] = await Promise.all([
      GET('/passes?status=active'),
      GET('/locations'),
    ]);
    const active = passes.find(p => p.status === 'active');
    container.innerHTML = active ? renderActivePass(active) : renderNoPass(locations);
  } catch (err) {
    container.innerHTML = `<div class="alert alert-error">${escHtml(err.message)}</div>`;
  }
}

function renderActivePass(pass) {
  const mins = Math.floor((Date.now() - new Date(pass.issued_at + 'Z').getTime()) / 60000);
  const overLimit = mins > pass.expected_duration_minutes;
  return `
    <div class="pass-display">
      <div class="pass-title">🎫 Active Hall Pass</div>
      <div class="pass-location">${escHtml(pass.location_name)}</div>
      <div class="pass-meta">
        <span>Issued by ${escHtml(pass.teacher_name)}</span>
        <span>at ${formatTime(pass.issued_at)}</span>
      </div>
      <div class="pass-timer" style="${overLimit ? 'color:#fca5a5' : ''}">
        ⏱ ${mins}m elapsed ${overLimit ? '— Please return to class!' : ''}
      </div>
    </div>
    ${pass.notes ? `<div class="alert alert-info">📝 ${escHtml(pass.notes)}</div>` : ''}
    <div class="card">
      <button class="btn btn-success" style="width:100%" onclick="returnMyPass(${pass.id})">
        ✅ I've Returned to Class
      </button>
    </div>`;
}

function renderNoPass(locations) {
  const locItems = locations.map(l => {
    const isFull = l.current_occupancy >= l.max_occupancy;
    return `<div class="location-item ${isFull ? 'location-full' : ''}" style="pointer-events:none">
      <div class="loc-name">${escHtml(l.name)}</div>
      <div class="loc-occupancy">${l.current_occupancy}/${l.max_occupancy} occupants
        <span class="badge ${isFull ? 'badge-full' : 'badge-available'}">${isFull ? 'Full' : 'Open'}</span>
      </div>
    </div>`;
  }).join('');

  return `
    <div class="card">
      <div class="card-header">No Active Pass</div>
      <div class="empty-state">
        <div class="emoji">🏫</div>
        <p>You don't have an active hall pass. Ask your teacher to issue one.</p>
      </div>
    </div>
    <div class="card">
      <div class="card-header">Location Status</div>
      <div class="location-grid">${locItems || '<p class="text-gray text-sm">No locations available</p>'}</div>
    </div>`;
}

async function returnMyPass(passId) {
  try {
    await PATCH(`/passes/${passId}/return`, {});
    showAlert('alert', 'Pass returned successfully!', 'success');
    await loadStudentContent();
  } catch (err) {
    showAlert('alert', err.message);
  }
}

// ─── TEACHER VIEW ─────────────────────────────────────────────────────────────

let teacherState = { tab: 'active', students: [], locations: [], activePasses: [] };

async function renderTeacher() {
  const user = getUser();
  document.getElementById('app').innerHTML = `
    ${navBar(user.display_name, 'Teacher')}
    <main id="main">
      <div id="alert" class="alert hidden"></div>
      <div class="tabs">
        <button class="tab-btn active" onclick="teacherTab('active',this)">Active Passes</button>
        <button class="tab-btn" onclick="teacherTab('issue',this)">Issue Pass</button>
        <button class="tab-btn" onclick="teacherTab('history',this)">History</button>
      </div>
      <div id="teacher-content">Loading…</div>
    </main>`;
  await loadTeacherData();
  await renderTeacherTab('active');
}

async function loadTeacherData() {
  const [students, locations, activePasses] = await Promise.all([
    GET('/admin/users').then(u => u.filter(x => x.role === 'student')).catch(() => []),
    GET('/locations'),
    GET('/passes/active').catch(() => []),
  ]);
  teacherState = { ...teacherState, students, locations, activePasses };
}

async function teacherTab(tab, el) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  teacherState.tab = tab;
  await renderTeacherTab(tab);
}

async function renderTeacherTab(tab) {
  const content = document.getElementById('teacher-content');
  if (tab === 'active') {
    const rows = teacherState.activePasses.map(p => `
      <tr>
        <td><strong>${escHtml(p.student_name)}</strong></td>
        <td>${escHtml(p.location_name)}</td>
        <td>${formatTime(p.issued_at)}</td>
        <td>${timeSince(p.issued_at)}</td>
        <td>
          <button class="btn btn-success btn-sm" onclick="teacherReturn(${p.id})">Return</button>
          <button class="btn btn-danger btn-sm" onclick="teacherExpire(${p.id})">Expire</button>
        </td>
      </tr>`).join('');

    content.innerHTML = `
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-value">${teacherState.activePasses.length}</div>
          <div class="stat-label">Active Passes</div>
        </div>
      </div>
      <div class="card">
        <div class="card-header">
          Active Passes
          <button class="btn btn-ghost btn-sm" onclick="refreshTeacher()">↻ Refresh</button>
        </div>
        <div class="table-wrap">
          ${rows ? `<table><thead><tr><th>Student</th><th>Location</th><th>Issued</th><th>Elapsed</th><th>Actions</th></tr></thead><tbody>${rows}</tbody></table>`
            : '<div class="empty-state"><div class="emoji">✅</div><p>No active passes right now.</p></div>'}
        </div>
      </div>`;
  } else if (tab === 'issue') {
    const studentOpts = teacherState.students.map(s =>
      `<option value="${s.id}">${escHtml(s.display_name)} (${escHtml(s.username)})</option>`
    ).join('');
    const locationOpts = teacherState.locations.map(l => {
      const isFull = l.current_occupancy >= l.max_occupancy;
      return `<option value="${l.id}" ${isFull ? 'disabled' : ''}>${escHtml(l.name)} (${l.current_occupancy}/${l.max_occupancy})${isFull ? ' — FULL' : ''}</option>`;
    }).join('');

    content.innerHTML = `
      <div class="card">
        <div class="card-header">Issue Hall Pass</div>
        <div id="issue-alert" class="alert hidden"></div>
        <form id="issue-form">
          <div class="form-group">
            <label>Student</label>
            <select id="ip-student" required><option value="">— select student —</option>${studentOpts}</select>
          </div>
          <div class="form-group">
            <label>Destination</label>
            <select id="ip-location" required><option value="">— select location —</option>${locationOpts}</select>
          </div>
          <div class="form-group">
            <label>Expected duration (minutes)</label>
            <input type="number" id="ip-duration" value="10" min="1" max="60">
          </div>
          <div class="form-group">
            <label>Notes (optional)</label>
            <input type="text" id="ip-notes" placeholder="e.g. Returning library book">
          </div>
          <button type="submit" class="btn btn-primary">🎫 Issue Pass</button>
        </form>
      </div>`;

    document.getElementById('issue-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const student_id = document.getElementById('ip-student').value;
      const location_id = document.getElementById('ip-location').value;
      const expected_duration_minutes = document.getElementById('ip-duration').value;
      const notes = document.getElementById('ip-notes').value.trim();
      try {
        await POST('/passes', { student_id: +student_id, location_id: +location_id, expected_duration_minutes: +expected_duration_minutes, notes: notes || undefined });
        showAlert('issue-alert', 'Pass issued successfully!', 'success');
        await loadTeacherData();
        document.getElementById('issue-form').reset();
      } catch (err) {
        showAlert('issue-alert', err.message);
      }
    });
  } else if (tab === 'history') {
    try {
      const passes = await GET('/passes');
      const rows = passes.map(p => `
        <tr>
          <td>${escHtml(p.student_name)}</td>
          <td>${escHtml(p.location_name)}</td>
          <td>${formatTime(p.issued_at)}</td>
          <td>${p.returned_at ? formatTime(p.returned_at) : '—'}</td>
          <td><span class="badge badge-${p.status}">${p.status}</span></td>
        </tr>`).join('');
      content.innerHTML = `
        <div class="card">
          <div class="card-header">Pass History (last 200)</div>
          <div class="table-wrap">
            <table><thead><tr><th>Student</th><th>Location</th><th>Issued</th><th>Returned</th><th>Status</th></tr></thead>
            <tbody>${rows || '<tr><td colspan="5" class="empty-state">No passes yet</td></tr>'}</tbody></table>
          </div>
        </div>`;
    } catch (err) {
      content.innerHTML = `<div class="alert alert-error">${escHtml(err.message)}</div>`;
    }
  }
}

async function teacherReturn(id) {
  try {
    await PATCH(`/passes/${id}/return`, {});
    await loadTeacherData();
    await renderTeacherTab(teacherState.tab);
  } catch (err) { showAlert('alert', err.message); }
}

async function teacherExpire(id) {
  if (!confirm('Mark this pass as expired?')) return;
  try {
    await PATCH(`/passes/${id}/expire`, {});
    await loadTeacherData();
    await renderTeacherTab(teacherState.tab);
  } catch (err) { showAlert('alert', err.message); }
}

async function refreshTeacher() {
  await loadTeacherData();
  await renderTeacherTab(teacherState.tab);
}

// ─── ADMIN VIEW ───────────────────────────────────────────────────────────────

let adminState = { tab: 'dashboard' };

async function renderAdmin() {
  const user = getUser();
  document.getElementById('app').innerHTML = `
    ${navBar(user.display_name, 'Admin')}
    <main id="main">
      <div id="alert" class="alert hidden"></div>
      <div class="tabs">
        <button class="tab-btn active" onclick="adminTab('dashboard',this)">Dashboard</button>
        <button class="tab-btn" onclick="adminTab('users',this)">Users</button>
        <button class="tab-btn" onclick="adminTab('locations',this)">Locations</button>
        <button class="tab-btn" onclick="adminTab('report',this)">Reports</button>
      </div>
      <div id="admin-content">Loading…</div>
    </main>`;
  await renderAdminTab('dashboard');
}

async function adminTab(tab, el) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  adminState.tab = tab;
  await renderAdminTab(tab);
}

async function renderAdminTab(tab) {
  const content = document.getElementById('admin-content');
  content.innerHTML = '<p class="text-gray text-sm">Loading…</p>';

  try {
    if (tab === 'dashboard') {
      const [stats, active] = await Promise.all([GET('/passes/stats'), GET('/passes/active')]);
      const locRows = stats.locations.map(l => {
        const pct = l.max_occupancy > 0 ? Math.round((l.current_occupancy / l.max_occupancy) * 100) : 0;
        const isFull = l.current_occupancy >= l.max_occupancy;
        return `<tr>
          <td>${escHtml(l.name)}</td>
          <td>${l.current_occupancy} / ${l.max_occupancy}</td>
          <td>
            <div style="background:var(--gray-200);border-radius:4px;height:8px;width:100px;overflow:hidden">
              <div style="background:${isFull ? 'var(--danger)' : 'var(--primary)'};height:100%;width:${pct}%"></div>
            </div>
          </td>
          <td><span class="badge ${isFull ? 'badge-full' : 'badge-available'}">${isFull ? 'Full' : 'Available'}</span></td>
        </tr>`;
      }).join('');

      const passRows = active.map(p => `
        <tr>
          <td><strong>${escHtml(p.student_name)}</strong></td>
          <td>${escHtml(p.location_name)}</td>
          <td>${escHtml(p.teacher_name)}</td>
          <td>${timeSince(p.issued_at)}</td>
          <td>
            <button class="btn btn-success btn-sm" onclick="adminReturn(${p.id})">Return</button>
            <button class="btn btn-danger btn-sm" onclick="adminExpire(${p.id})">Expire</button>
          </td>
        </tr>`).join('');

      content.innerHTML = `
        <div class="stats-grid">
          <div class="stat-card"><div class="stat-value">${stats.active_passes}</div><div class="stat-label">Active Passes</div></div>
          <div class="stat-card"><div class="stat-value">${stats.passes_today}</div><div class="stat-label">Passes Today</div></div>
          <div class="stat-card"><div class="stat-value">${stats.locations.length}</div><div class="stat-label">Locations</div></div>
        </div>
        <div class="card">
          <div class="card-header">Location Occupancy
            <button class="btn btn-ghost btn-sm" onclick="renderAdminTab('dashboard')">↻ Refresh</button>
          </div>
          <div class="table-wrap">
            <table><thead><tr><th>Location</th><th>Occupancy</th><th>Usage</th><th>Status</th></tr></thead>
            <tbody>${locRows || '<tr><td colspan="4">No locations</td></tr>'}</tbody></table>
          </div>
        </div>
        <div class="card">
          <div class="card-header">Active Passes</div>
          <div class="table-wrap">
            ${passRows ? `<table><thead><tr><th>Student</th><th>Location</th><th>Teacher</th><th>Elapsed</th><th>Actions</th></tr></thead><tbody>${passRows}</tbody></table>`
              : '<div class="empty-state"><div class="emoji">✅</div><p>No active passes.</p></div>'}
          </div>
        </div>`;

    } else if (tab === 'users') {
      const users = await GET('/admin/users');
      await renderAdminUsers(users, content);

    } else if (tab === 'locations') {
      const locs = await GET('/locations');
      await renderAdminLocations(locs, content);

    } else if (tab === 'report') {
      renderAdminReport(content);
    }
  } catch (err) {
    content.innerHTML = `<div class="alert alert-error">${escHtml(err.message)}</div>`;
  }
}

async function renderAdminUsers(users, container) {
  const rows = users.map(u => `
    <tr>
      <td>${escHtml(u.display_name)}</td>
      <td>${escHtml(u.username)}</td>
      <td><span class="badge badge-${u.role}">${u.role}</span></td>
      <td>
        <button class="btn btn-ghost btn-sm" onclick="editUser(${u.id},'${escHtml(u.display_name)}','${u.role}')">Edit</button>
        <button class="btn btn-danger btn-sm" onclick="deleteUser(${u.id},'${escHtml(u.display_name)}')">Delete</button>
      </td>
    </tr>`).join('');

  container.innerHTML = `
    <div class="card">
      <div class="card-header">Users
        <button class="btn btn-primary btn-sm" onclick="showAddUserModal()">+ Add User</button>
      </div>
      <div id="users-alert" class="alert hidden"></div>
      <div class="table-wrap">
        <table><thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Actions</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="4">No users</td></tr>'}</tbody></table>
      </div>
    </div>
    <div id="user-modal"></div>`;
}

function showAddUserModal() {
  document.getElementById('user-modal').innerHTML = `
    <div class="modal-overlay" onclick="if(event.target===this)closeModal('user-modal')">
      <div class="modal">
        <div class="modal-header">
          <h3>Add User</h3>
          <button class="modal-close" onclick="closeModal('user-modal')">×</button>
        </div>
        <div id="add-user-alert" class="alert hidden"></div>
        <form id="add-user-form">
          <div class="form-group"><label>Display Name</label><input id="au-name" required></div>
          <div class="form-group"><label>Username</label><input id="au-username" required></div>
          <div class="form-group"><label>Password</label><input type="password" id="au-pass" required minlength="6"></div>
          <div class="form-group"><label>Role</label>
            <select id="au-role">
              <option value="student">Student</option>
              <option value="teacher">Teacher</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div style="display:flex;gap:.5rem;justify-content:flex-end">
            <button type="button" class="btn btn-ghost" onclick="closeModal('user-modal')">Cancel</button>
            <button type="submit" class="btn btn-primary">Create</button>
          </div>
        </form>
      </div>
    </div>`;

  document.getElementById('add-user-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await POST('/admin/users', {
        display_name: document.getElementById('au-name').value.trim(),
        username: document.getElementById('au-username').value.trim(),
        password: document.getElementById('au-pass').value,
        role: document.getElementById('au-role').value,
      });
      closeModal('user-modal');
      await renderAdminTab('users');
    } catch (err) { showAlert('add-user-alert', err.message); }
  });
}

async function editUser(id, name, role) {
  document.getElementById('user-modal').innerHTML = `
    <div class="modal-overlay" onclick="if(event.target===this)closeModal('user-modal')">
      <div class="modal">
        <div class="modal-header">
          <h3>Edit User</h3>
          <button class="modal-close" onclick="closeModal('user-modal')">×</button>
        </div>
        <div id="edit-user-alert" class="alert hidden"></div>
        <form id="edit-user-form">
          <div class="form-group"><label>Display Name</label><input id="eu-name" value="${escHtml(name)}" required></div>
          <div class="form-group"><label>Role</label>
            <select id="eu-role">
              <option value="student" ${role==='student'?'selected':''}>Student</option>
              <option value="teacher" ${role==='teacher'?'selected':''}>Teacher</option>
              <option value="admin" ${role==='admin'?'selected':''}>Admin</option>
            </select>
          </div>
          <div class="form-group"><label>New Password (leave blank to keep)</label><input type="password" id="eu-pass" minlength="6"></div>
          <div style="display:flex;gap:.5rem;justify-content:flex-end">
            <button type="button" class="btn btn-ghost" onclick="closeModal('user-modal')">Cancel</button>
            <button type="submit" class="btn btn-primary">Save</button>
          </div>
        </form>
      </div>
    </div>`;

  document.getElementById('edit-user-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {
      display_name: document.getElementById('eu-name').value.trim(),
      role: document.getElementById('eu-role').value,
    };
    const pw = document.getElementById('eu-pass').value;
    if (pw) body.password = pw;
    try {
      await PATCH(`/admin/users/${id}`, body);
      closeModal('user-modal');
      await renderAdminTab('users');
    } catch (err) { showAlert('edit-user-alert', err.message); }
  });
}

async function deleteUser(id, name) {
  if (!confirm(`Delete user "${name}"? This cannot be undone.`)) return;
  try {
    await DELETE(`/admin/users/${id}`);
    await renderAdminTab('users');
  } catch (err) { showAlert('alert', err.message); }
}

async function renderAdminLocations(locs, container) {
  const rows = locs.map(l => {
    const isFull = l.current_occupancy >= l.max_occupancy;
    return `<tr>
      <td>${escHtml(l.name)}</td>
      <td>${l.current_occupancy} / ${l.max_occupancy}</td>
      <td><span class="badge ${isFull ? 'badge-full' : 'badge-available'}">${isFull ? 'Full' : 'Available'}</span></td>
      <td>
        <button class="btn btn-ghost btn-sm" onclick="editLocation(${l.id},'${escHtml(l.name)}',${l.max_occupancy})">Edit</button>
        <button class="btn btn-ghost btn-sm" onclick="toggleLocation(${l.id},${l.active})">${l.active ? 'Deactivate' : 'Activate'}</button>
      </td>
    </tr>`;
  }).join('');

  container.innerHTML = `
    <div class="card">
      <div class="card-header">Locations
        <button class="btn btn-primary btn-sm" onclick="showAddLocationModal()">+ Add Location</button>
      </div>
      <div id="loc-alert" class="alert hidden"></div>
      <div class="table-wrap">
        <table><thead><tr><th>Name</th><th>Occupancy</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="4">No locations</td></tr>'}</tbody></table>
      </div>
    </div>
    <div id="loc-modal"></div>`;
}

function showAddLocationModal() {
  document.getElementById('loc-modal').innerHTML = `
    <div class="modal-overlay" onclick="if(event.target===this)closeModal('loc-modal')">
      <div class="modal">
        <div class="modal-header">
          <h3>Add Location</h3>
          <button class="modal-close" onclick="closeModal('loc-modal')">×</button>
        </div>
        <div id="add-loc-alert" class="alert hidden"></div>
        <form id="add-loc-form">
          <div class="form-group"><label>Location Name</label><input id="al-name" required placeholder="e.g. Bathroom - 2nd Floor"></div>
          <div class="form-group"><label>Max Occupancy</label><input type="number" id="al-max" value="2" min="1" max="50"></div>
          <div style="display:flex;gap:.5rem;justify-content:flex-end">
            <button type="button" class="btn btn-ghost" onclick="closeModal('loc-modal')">Cancel</button>
            <button type="submit" class="btn btn-primary">Add</button>
          </div>
        </form>
      </div>
    </div>`;

  document.getElementById('add-loc-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await POST('/locations', {
        name: document.getElementById('al-name').value.trim(),
        max_occupancy: +document.getElementById('al-max').value,
      });
      closeModal('loc-modal');
      await renderAdminTab('locations');
    } catch (err) { showAlert('add-loc-alert', err.message); }
  });
}

async function editLocation(id, name, max) {
  document.getElementById('loc-modal').innerHTML = `
    <div class="modal-overlay" onclick="if(event.target===this)closeModal('loc-modal')">
      <div class="modal">
        <div class="modal-header">
          <h3>Edit Location</h3>
          <button class="modal-close" onclick="closeModal('loc-modal')">×</button>
        </div>
        <div id="edit-loc-alert" class="alert hidden"></div>
        <form id="edit-loc-form">
          <div class="form-group"><label>Location Name</label><input id="el-name" value="${escHtml(name)}" required></div>
          <div class="form-group"><label>Max Occupancy</label><input type="number" id="el-max" value="${max}" min="1" max="50"></div>
          <div style="display:flex;gap:.5rem;justify-content:flex-end">
            <button type="button" class="btn btn-ghost" onclick="closeModal('loc-modal')">Cancel</button>
            <button type="submit" class="btn btn-primary">Save</button>
          </div>
        </form>
      </div>
    </div>`;

  document.getElementById('edit-loc-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await PATCH(`/locations/${id}`, {
        name: document.getElementById('el-name').value.trim(),
        max_occupancy: +document.getElementById('el-max').value,
      });
      closeModal('loc-modal');
      await renderAdminTab('locations');
    } catch (err) { showAlert('edit-loc-alert', err.message); }
  });
}

async function toggleLocation(id, active) {
  try {
    await PATCH(`/locations/${id}`, { active: !active });
    await renderAdminTab('locations');
  } catch (err) { showAlert('alert', err.message); }
}

function renderAdminReport(container) {
  container.innerHTML = `
    <div class="card">
      <div class="card-header">Pass Report</div>
      <form id="report-form" style="display:flex;gap:.75rem;flex-wrap:wrap;align-items:flex-end;margin-bottom:1rem">
        <div class="form-group" style="margin:0;min-width:150px">
          <label>Start Date</label>
          <input type="date" id="rp-start">
        </div>
        <div class="form-group" style="margin:0;min-width:150px">
          <label>End Date</label>
          <input type="date" id="rp-end">
        </div>
        <div class="form-group" style="margin:0">
          <label>Status</label>
          <select id="rp-status">
            <option value="">All</option>
            <option>active</option><option>returned</option><option>expired</option>
          </select>
        </div>
        <button type="submit" class="btn btn-primary">Run Report</button>
      </form>
      <div id="report-results"></div>
    </div>`;

  document.getElementById('report-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const params = new URLSearchParams();
    const start = document.getElementById('rp-start').value;
    const end   = document.getElementById('rp-end').value;
    const stat  = document.getElementById('rp-status').value;
    if (start) params.set('start_date', start);
    if (end)   params.set('end_date', end);
    if (stat)  params.set('status', stat);
    try {
      const rows = await GET(`/admin/report?${params}`);
      const tableRows = rows.map(p => `
        <tr>
          <td>${escHtml(p.student_name)}</td>
          <td>${escHtml(p.location_name)}</td>
          <td>${escHtml(p.teacher_name)}</td>
          <td>${formatTime(p.issued_at)}</td>
          <td>${p.returned_at ? formatTime(p.returned_at) : '—'}</td>
          <td><span class="badge badge-${p.status}">${p.status}</span></td>
        </tr>`).join('');
      document.getElementById('report-results').innerHTML = `
        <p class="text-sm text-gray" style="margin-bottom:.5rem">${rows.length} result(s)</p>
        <div class="table-wrap">
          <table><thead><tr><th>Student</th><th>Location</th><th>Teacher</th><th>Issued</th><th>Returned</th><th>Status</th></tr></thead>
          <tbody>${tableRows || '<tr><td colspan="6">No results</td></tr>'}</tbody></table>
        </div>`;
    } catch (err) { showAlert('alert', err.message); }
  });
}

async function adminReturn(id) {
  try { await PATCH(`/passes/${id}/return`, {}); await renderAdminTab(adminState.tab); }
  catch (err) { showAlert('alert', err.message); }
}

async function adminExpire(id) {
  if (!confirm('Mark this pass as expired?')) return;
  try { await PATCH(`/passes/${id}/expire`, {}); await renderAdminTab(adminState.tab); }
  catch (err) { showAlert('alert', err.message); }
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = '';
}

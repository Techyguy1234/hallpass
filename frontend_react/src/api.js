const API_BASE = '/api';

export function getToken() { return localStorage.getItem('hp_token'); }
export function getUser() { return JSON.parse(localStorage.getItem('hp_user') || 'null'); }
export function saveAuth(token, user) {
  localStorage.setItem('hp_token', token);
  localStorage.setItem('hp_user', JSON.stringify(user));
}
export function clearAuth() {
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

export const GET    = (p)    => api('GET',    p);
export const POST   = (p, b) => api('POST',   p, b);
export const PATCH  = (p, b) => api('PATCH',  p, b);
export const DELETE = (p)    => api('DELETE', p);

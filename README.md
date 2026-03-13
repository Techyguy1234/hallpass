# 🎫 HallPass

**HallPass** is an open-source digital hall pass management system — a free, self-hostable alternative to SmartPass.

## Features

| Feature | HallPass |
|---|---|
| Digital hall passes | ✅ |
| Role-based access (Admin / Teacher / Student) | ✅ |
| Real-time occupancy limits per location | ✅ |
| One active pass per student enforcement | ✅ |
| Pass lifecycle: active → returned / expired | ✅ |
| Pass history & audit trail | ✅ |
| Admin dashboard with statistics | ✅ |
| Teacher dashboard (issue, return, expire passes) | ✅ |
| Student portal (view active pass, self-return) | ✅ |
| Location management (add, edit, set max occupancy) | ✅ |
| User management (admin creates/edits/deletes users) | ✅ |
| Filterable reports | ✅ |
| JWT-based authentication | ✅ |
| No external services required | ✅ |

---

## Architecture

```
hallpass/
├── backend/           ← Python + Flask REST API (all branches)
├── frontend_react/    ← React frontend  (available on: frontend/react branch)
├── frontend_flet/     ← Flet  frontend  (available on: frontend/flet  branch)
├── public/            ← Flask static file serving (populated by React build)
└── tests/             ← pytest integration tests
```

Two ready-to-use frontend branches let you pick your preferred UI:

| Branch | Frontend | Language |
|---|---|---|
| `frontend/react` | React (Vite, runs in the browser) | JavaScript |
| `frontend/flet`  | Flet (desktop window **and** browser) | Python |

---

## Quick Start — Python / Flask backend

### Prerequisites

- Python 3.10+

### Install & run

```bash
git clone https://github.com/Techyguy1234/hallpass.git
cd hallpass
pip install -r backend/requirements.txt
python -m backend.run
```

The API server starts on **http://localhost:5000**.

**Default admin credentials:** `admin` / `admin123`
> ⚠️ Change the admin password immediately after first login.

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `5000` | HTTP port |
| `JWT_SECRET` | `hallpass-dev-secret-change-in-production` | JWT signing secret — **must be changed in production** |
| `DB_PATH` | `./hallpass.db` | Path to the SQLite database file |

Example `.env`:
```
PORT=5000
JWT_SECRET=your-very-long-random-secret-here
DB_PATH=/data/hallpass.db
```

---

## Frontend Option 1 — React

Switch to the React branch, install dependencies, and start the dev server:

```bash
git checkout frontend/react
cd frontend_react
npm install
npm run dev          # Vite dev server with proxy → Flask on :5000
```

Open **http://localhost:5173** in your browser.

To build for production (output goes to `public/`, served by Flask):

```bash
npm run build
# Then run the Flask backend — it will serve the built SPA
python -m backend.run
```

---

## Frontend Option 2 — Flet

Switch to the Flet branch and run the Python desktop/web UI:

```bash
git checkout frontend/flet
pip install -r frontend_flet/requirements.txt

# Desktop window:
python frontend_flet/main.py

# Browser:
flet run frontend_flet/main.py --web
```

Point to a different backend server:

```bash
HALLPASS_API=http://my-server:5000 python frontend_flet/main.py
```

---

## Running Tests

```bash
pip install -r backend/requirements.txt
python -m pytest tests/ -v
```

---

## API

All endpoints (except `/api/auth/login`) require a `Bearer <token>` header.

| Method | Endpoint | Role | Description |
|---|---|---|---|
| `POST` | `/api/auth/login` | Any | Authenticate and get a JWT |
| `POST` | `/api/auth/register` | Any | Self-register |
| `GET` | `/api/passes` | Any | List passes (role-scoped) |
| `GET` | `/api/passes/active` | Admin/Teacher | All currently active passes |
| `POST` | `/api/passes` | Admin/Teacher | Issue a new pass |
| `PATCH` | `/api/passes/:id/return` | Any | Mark pass returned |
| `PATCH` | `/api/passes/:id/expire` | Admin/Teacher | Mark pass expired |
| `GET` | `/api/passes/stats` | Admin/Teacher | Summary statistics |
| `GET` | `/api/locations` | Any (auth) | List locations with occupancy |
| `POST` | `/api/locations` | Admin | Add location |
| `PATCH` | `/api/locations/:id` | Admin | Edit location |
| `GET` | `/api/admin/users` | Admin | List all users |
| `POST` | `/api/admin/users` | Admin | Create user |
| `PATCH` | `/api/admin/users/:id` | Admin | Update user |
| `DELETE` | `/api/admin/users/:id` | Admin | Delete user |
| `GET` | `/api/admin/report` | Admin | Filtered pass history |
| `GET` | `/api/users/students` | Admin/Teacher | List student accounts |
| `GET` | `/api/health` | Public | Health check |

---

## Creating the Frontend Branches

After merging this PR, run the helper script to create the two frontend branches:

```bash
# Create the React-focused branch
git checkout -b frontend/react
git push -u origin frontend/react

# Create the Flet-focused branch (from the same base)
git checkout main   # or the base branch
git checkout -b frontend/flet
git push -u origin frontend/flet
```

Both branches contain the full Flask backend plus their respective frontend.

---

## Tech Stack

- **Backend:** Python 3.10+ · Flask 3 · SQLite (stdlib `sqlite3`) · PyJWT · bcrypt · flask-limiter
- **Frontend (React branch):** React 18 · Vite 5
- **Frontend (Flet branch):** Flet · requests
- **Tests:** pytest

## License

ISC
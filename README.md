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

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v18+

### Installation

```bash
git clone https://github.com/Techyguy1234/hallpass.git
cd hallpass
npm install
npm start
```

The server starts at **http://localhost:3000**.

**Default admin credentials:** `admin` / `admin123`
> ⚠️ Change the admin password immediately after first login.

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `JWT_SECRET` | `hallpass-dev-secret-change-in-production` | JWT signing secret — **must be changed in production** |
| `DB_PATH` | `./hallpass.db` | Path to the SQLite database file |

Example `.env`:
```
PORT=3000
JWT_SECRET=your-very-long-random-secret-here
DB_PATH=/data/hallpass.db
```

## Usage

### Admin
1. Log in with admin credentials
2. **Users tab** — create teacher and student accounts
3. **Locations tab** — add locations (bathrooms, library, nurse, etc.) and set max occupancy
4. **Dashboard** — see all active passes and location occupancy in real-time
5. **Reports tab** — filter pass history by date, student, teacher, or status

### Teacher
1. Log in with your teacher account
2. **Issue Pass tab** — select a student and destination, issue a hall pass
3. **Active Passes tab** — view, return, or expire passes in your class
4. **History tab** — review your pass history

### Student
1. Log in with your student account
2. View your active pass (if any) with timer and destination
3. Click **"I've Returned to Class"** when back

## API

All endpoints (except `/api/auth/login`) require a `Bearer <token>` header.

| Method | Endpoint | Role | Description |
|---|---|---|---|
| `POST` | `/api/auth/login` | Any | Authenticate and get a JWT |
| `POST` | `/api/auth/register` | Any | Self-register (open — restrict in production) |
| `GET` | `/api/passes` | Any | List passes (role-scoped) |
| `GET` | `/api/passes/active` | Admin/Teacher | All currently active passes |
| `POST` | `/api/passes` | Admin/Teacher | Issue a new pass |
| `PATCH` | `/api/passes/:id/return` | Any | Mark pass returned |
| `PATCH` | `/api/passes/:id/expire` | Admin/Teacher | Mark pass expired |
| `GET` | `/api/passes/stats` | Admin/Teacher | Summary statistics |
| `GET` | `/api/locations` | Any | List locations with occupancy |
| `POST` | `/api/locations` | Admin | Add location |
| `PATCH` | `/api/locations/:id` | Admin | Edit location |
| `GET` | `/api/admin/users` | Admin | List all users |
| `POST` | `/api/admin/users` | Admin | Create user |
| `PATCH` | `/api/admin/users/:id` | Admin | Update user |
| `DELETE` | `/api/admin/users/:id` | Admin | Delete user |
| `GET` | `/api/admin/report` | Admin | Filtered pass history |

## Running Tests

```bash
npm test
```

## Tech Stack

- **Backend:** Node.js + Express 5
- **Database:** SQLite (via [better-sqlite3](https://github.com/WiseLibs/better-sqlite3))
- **Auth:** JWT (via [jsonwebtoken](https://github.com/auth0/node-jsonwebtoken))
- **Frontend:** Vanilla HTML/CSS/JS (no build step)
- **Tests:** Jest + Supertest

## License

ISC
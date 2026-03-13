import os
import sqlite3
import threading
import bcrypt

DB_PATH = os.environ.get("DB_PATH", os.path.join(os.path.dirname(__file__), "..", "hallpass.db"))

_local = threading.local()


def get_db():
    if not hasattr(_local, "conn") or _local.conn is None:
        _local.conn = sqlite3.connect(DB_PATH, check_same_thread=False)
        _local.conn.row_factory = sqlite3.Row
        _local.conn.execute("PRAGMA journal_mode=WAL")
        _local.conn.execute("PRAGMA foreign_keys=ON")
        _init_schema(_local.conn)
    return _local.conn


def close_db():
    if hasattr(_local, "conn") and _local.conn is not None:
        _local.conn.close()
        _local.conn = None


def _init_schema(conn):
    conn.executescript("""
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
    """)
    conn.commit()
    _seed_defaults(conn)


def _seed_defaults(conn):
    cur = conn.cursor()

    location_count = cur.execute("SELECT COUNT(*) FROM locations").fetchone()[0]
    if location_count == 0:
        default_locations = [
            ("Bathroom - Main Hall", 2),
            ("Bathroom - Gym Wing", 2),
            ("Nurse", 1),
            ("Main Office", 2),
            ("Library", 5),
            ("Water Fountain", 3),
            ("Counselor", 1),
        ]
        cur.executemany(
            "INSERT INTO locations (name, max_occupancy) VALUES (?, ?)", default_locations
        )

    user_count = cur.execute("SELECT COUNT(*) FROM users").fetchone()[0]
    if user_count == 0:
        hashed = bcrypt.hashpw(b"admin123", bcrypt.gensalt()).decode()
        cur.execute(
            "INSERT INTO users (username, password_hash, role, display_name) VALUES (?, ?, ?, ?)",
            ("admin", hashed, "admin", "Administrator"),
        )

    conn.commit()

import bcrypt
from flask import Blueprint, request, jsonify
from backend.db import get_db
from backend.auth import require_role

admin_bp = Blueprint("admin", __name__)


@admin_bp.route("/users", methods=["GET"])
@require_role("admin")
def list_users():
    db = get_db()
    rows = db.execute(
        "SELECT id, username, role, display_name, created_at FROM users ORDER BY role, display_name"
    ).fetchall()
    return jsonify([dict(r) for r in rows])


@admin_bp.route("/users/<int:user_id>", methods=["GET"])
@require_role("admin")
def get_user(user_id):
    db = get_db()
    row = db.execute(
        "SELECT id, username, role, display_name, created_at FROM users WHERE id = ?", (user_id,)
    ).fetchone()
    if not row:
        return jsonify({"error": "User not found"}), 404
    return jsonify(dict(row))


@admin_bp.route("/users", methods=["POST"])
@require_role("admin")
def create_user():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""
    role = data.get("role") or ""
    display_name = (data.get("display_name") or "").strip()

    if not username or not password or not role or not display_name:
        return jsonify({"error": "All fields required"}), 400
    if role not in ("admin", "teacher", "student"):
        return jsonify({"error": "Invalid role"}), 400
    if len(password) < 6:
        return jsonify({"error": "Password must be at least 6 characters"}), 400

    db = get_db()
    if db.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone():
        return jsonify({"error": "Username already taken"}), 409

    hashed = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
    cur = db.execute(
        "INSERT INTO users (username, password_hash, role, display_name) VALUES (?, ?, ?, ?)",
        (username, hashed, role, display_name),
    )
    db.commit()
    return jsonify({"id": cur.lastrowid, "username": username, "role": role, "display_name": display_name}), 201


@admin_bp.route("/users/<int:user_id>", methods=["PATCH"])
@require_role("admin")
def update_user(user_id):
    db = get_db()
    row = db.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    if not row:
        return jsonify({"error": "User not found"}), 404

    data = request.get_json(silent=True) or {}
    display_name = data["display_name"].strip() if "display_name" in data else row["display_name"]
    role = data.get("role", row["role"])
    if role not in ("admin", "teacher", "student"):
        return jsonify({"error": "Invalid role"}), 400

    if "password" in data:
        password = data["password"]
        if len(password) < 6:
            return jsonify({"error": "Password must be at least 6 characters"}), 400
        hashed = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
        db.execute(
            "UPDATE users SET display_name = ?, role = ?, password_hash = ? WHERE id = ?",
            (display_name, role, hashed, user_id),
        )
    else:
        db.execute(
            "UPDATE users SET display_name = ?, role = ? WHERE id = ?",
            (display_name, role, user_id),
        )
    db.commit()
    return jsonify({"id": user_id, "username": row["username"], "role": role, "display_name": display_name})


@admin_bp.route("/users/<int:user_id>", methods=["DELETE"])
@require_role("admin")
def delete_user(user_id):
    db = get_db()
    row = db.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    if not row:
        return jsonify({"error": "User not found"}), 404

    if row["role"] == "admin":
        count = db.execute("SELECT COUNT(*) FROM users WHERE role = 'admin'").fetchone()[0]
        if count <= 1:
            return jsonify({"error": "Cannot delete the last admin account"}), 409

    if db.execute(
        "SELECT id FROM passes WHERE (student_id = ? OR teacher_id = ?) AND status = 'active'",
        (user_id, user_id),
    ).fetchone():
        return jsonify({"error": "Cannot delete user with active passes"}), 409

    db.execute("DELETE FROM users WHERE id = ?", (user_id,))
    db.commit()
    return "", 204


@admin_bp.route("/report", methods=["GET"])
@require_role("admin")
def report():
    db = get_db()
    args = request.args
    query = """
        SELECT p.*,
               s.display_name as student_name, s.username as student_username,
               t.display_name as teacher_name,
               l.name as location_name
        FROM passes p
        JOIN users s ON s.id = p.student_id
        JOIN users t ON t.id = p.teacher_id
        JOIN locations l ON l.id = p.location_id
        WHERE 1=1
    """
    params = []
    if args.get("start_date"):
        query += " AND date(p.issued_at) >= ?"
        params.append(args["start_date"])
    if args.get("end_date"):
        query += " AND date(p.issued_at) <= ?"
        params.append(args["end_date"])
    if args.get("student_id"):
        query += " AND p.student_id = ?"
        params.append(args["student_id"])
    if args.get("teacher_id"):
        query += " AND p.teacher_id = ?"
        params.append(args["teacher_id"])
    if args.get("location_id"):
        query += " AND p.location_id = ?"
        params.append(args["location_id"])
    if args.get("status"):
        query += " AND p.status = ?"
        params.append(args["status"])

    query += " ORDER BY p.issued_at DESC LIMIT 500"
    rows = db.execute(query, params).fetchall()
    return jsonify([dict(r) for r in rows])

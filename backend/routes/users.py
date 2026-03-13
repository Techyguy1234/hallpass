from flask import Blueprint, jsonify
from backend.db import get_db
from backend.auth import require_role

users_bp = Blueprint("users", __name__)


@users_bp.route("/students", methods=["GET"])
@require_role("admin", "teacher")
def list_students():
    db = get_db()
    rows = db.execute(
        "SELECT id, username, display_name FROM users WHERE role = 'student' ORDER BY display_name"
    ).fetchall()
    return jsonify([dict(r) for r in rows])

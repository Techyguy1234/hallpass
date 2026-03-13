from flask import Blueprint, request, jsonify
from backend.db import get_db
from backend.auth import require_auth, require_role

passes_bp = Blueprint("passes", __name__)


@passes_bp.route("/", methods=["GET"])
@require_auth
def list_passes():
    db = get_db()
    user = request.user
    status = request.args.get("status")
    student_id = request.args.get("student_id")

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

    if user["role"] == "student":
        query += " AND p.student_id = ?"
        params.append(user["id"])
    elif user["role"] == "teacher":
        query += " AND p.teacher_id = ?"
        params.append(user["id"])

    if status:
        query += " AND p.status = ?"
        params.append(status)
    if student_id and user["role"] != "student":
        query += " AND p.student_id = ?"
        params.append(student_id)

    query += " ORDER BY p.issued_at DESC"

    try:
        limit = min(int(request.args.get("limit", 50)), 500)
    except (ValueError, TypeError):
        limit = 50
    try:
        offset = max(int(request.args.get("offset", 0)), 0)
    except (ValueError, TypeError):
        offset = 0

    query += " LIMIT ? OFFSET ?"
    params.extend([limit, offset])

    rows = db.execute(query, params).fetchall()
    return jsonify([dict(r) for r in rows])


@passes_bp.route("/active", methods=["GET"])
@require_role("admin", "teacher")
def active_passes():
    db = get_db()
    rows = db.execute("""
        SELECT p.*,
               s.display_name as student_name, s.username as student_username,
               t.display_name as teacher_name,
               l.name as location_name
        FROM passes p
        JOIN users s ON s.id = p.student_id
        JOIN users t ON t.id = p.teacher_id
        JOIN locations l ON l.id = p.location_id
        WHERE p.status = 'active'
        ORDER BY p.issued_at ASC
    """).fetchall()
    return jsonify([dict(r) for r in rows])


@passes_bp.route("/stats", methods=["GET"])
@require_role("admin", "teacher")
def stats():
    db = get_db()
    active_count = db.execute(
        "SELECT COUNT(*) FROM passes WHERE status = 'active'"
    ).fetchone()[0]
    today_count = db.execute(
        "SELECT COUNT(*) FROM passes WHERE date(issued_at) = date('now')"
    ).fetchone()[0]
    location_stats = db.execute("""
        SELECT l.name, l.max_occupancy,
               COUNT(p.id) as current_occupancy
        FROM locations l
        LEFT JOIN passes p ON p.location_id = l.id AND p.status = 'active'
        WHERE l.active = 1
        GROUP BY l.id
        ORDER BY current_occupancy DESC
    """).fetchall()
    return jsonify({
        "active_passes": active_count,
        "passes_today": today_count,
        "locations": [dict(r) for r in location_stats],
    })


@passes_bp.route("/", methods=["POST"])
@require_role("admin", "teacher")
def issue_pass():
    data = request.get_json(silent=True) or {}
    student_id = data.get("student_id")
    location_id = data.get("location_id")
    if not student_id or not location_id:
        return jsonify({"error": "student_id and location_id are required"}), 400

    db = get_db()

    student = db.execute(
        "SELECT * FROM users WHERE id = ? AND role = 'student'", (student_id,)
    ).fetchone()
    if not student:
        return jsonify({"error": "Student not found"}), 404

    if db.execute(
        "SELECT id FROM passes WHERE student_id = ? AND status = 'active'", (student_id,)
    ).fetchone():
        return jsonify({"error": "Student already has an active pass"}), 409

    location = db.execute(
        "SELECT * FROM locations WHERE id = ? AND active = 1", (location_id,)
    ).fetchone()
    if not location:
        return jsonify({"error": "Location not found or inactive"}), 404

    occupancy = db.execute(
        "SELECT COUNT(*) FROM passes WHERE location_id = ? AND status = 'active'",
        (location_id,),
    ).fetchone()[0]
    if occupancy >= location["max_occupancy"]:
        return jsonify({
            "error": f"{location['name']} is at capacity ({location['max_occupancy']} max). Cannot issue pass."
        }), 409

    try:
        duration = int(data.get("expected_duration_minutes", 10))
    except (ValueError, TypeError):
        duration = 10

    notes = data.get("notes") or None
    cur = db.execute(
        "INSERT INTO passes (student_id, teacher_id, location_id, notes, expected_duration_minutes) VALUES (?, ?, ?, ?, ?)",
        (student_id, request.user["id"], location_id, notes, duration),
    )
    db.commit()

    row = db.execute("""
        SELECT p.*,
               s.display_name as student_name,
               t.display_name as teacher_name,
               l.name as location_name
        FROM passes p
        JOIN users s ON s.id = p.student_id
        JOIN users t ON t.id = p.teacher_id
        JOIN locations l ON l.id = p.location_id
        WHERE p.id = ?
    """, (cur.lastrowid,)).fetchone()
    return jsonify(dict(row)), 201


@passes_bp.route("/<int:pass_id>/return", methods=["PATCH"])
@require_auth
def return_pass(pass_id):
    db = get_db()
    row = db.execute("SELECT * FROM passes WHERE id = ?", (pass_id,)).fetchone()
    if not row:
        return jsonify({"error": "Pass not found"}), 404
    if row["status"] != "active":
        return jsonify({"error": "Pass is not active"}), 409
    if request.user["role"] == "student" and row["student_id"] != request.user["id"]:
        return jsonify({"error": "You can only return your own pass"}), 403

    db.execute(
        "UPDATE passes SET status = 'returned', returned_at = datetime('now') WHERE id = ?",
        (pass_id,),
    )
    db.commit()
    return jsonify({"id": pass_id, "status": "returned"})


@passes_bp.route("/<int:pass_id>/expire", methods=["PATCH"])
@require_role("admin", "teacher")
def expire_pass(pass_id):
    db = get_db()
    row = db.execute("SELECT * FROM passes WHERE id = ?", (pass_id,)).fetchone()
    if not row:
        return jsonify({"error": "Pass not found"}), 404
    if row["status"] != "active":
        return jsonify({"error": "Pass is not active"}), 409

    db.execute(
        "UPDATE passes SET status = 'expired', returned_at = datetime('now') WHERE id = ?",
        (pass_id,),
    )
    db.commit()
    return jsonify({"id": pass_id, "status": "expired"})

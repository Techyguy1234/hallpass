from flask import Blueprint, request, jsonify
from backend.db import get_db
from backend.auth import require_auth, require_role

locations_bp = Blueprint("locations", __name__)


@locations_bp.route("/", methods=["GET"])
@require_auth
def list_locations():
    db = get_db()
    rows = db.execute("""
        SELECT l.id, l.name, l.max_occupancy, l.active,
               COUNT(p.id) as current_occupancy
        FROM locations l
        LEFT JOIN passes p ON p.location_id = l.id AND p.status = 'active'
        WHERE l.active = 1
        GROUP BY l.id
        ORDER BY l.name
    """).fetchall()
    return jsonify([dict(r) for r in rows])


@locations_bp.route("/", methods=["POST"])
@require_role("admin")
def create_location():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "Location name is required"}), 400
    try:
        max_occ = int(data.get("max_occupancy", 3))
    except (ValueError, TypeError):
        max_occ = 3
    if max_occ < 1:
        return jsonify({"error": "max_occupancy must be at least 1"}), 400

    db = get_db()
    try:
        cur = db.execute(
            "INSERT INTO locations (name, max_occupancy) VALUES (?, ?)", (name, max_occ)
        )
        db.commit()
    except Exception as exc:
        if "UNIQUE" in str(exc):
            return jsonify({"error": "A location with that name already exists"}), 409
        raise
    return jsonify({"id": cur.lastrowid, "name": name, "max_occupancy": max_occ, "active": 1}), 201


@locations_bp.route("/<int:loc_id>", methods=["PATCH"])
@require_role("admin")
def update_location(loc_id):
    db = get_db()
    row = db.execute("SELECT * FROM locations WHERE id = ?", (loc_id,)).fetchone()
    if not row:
        return jsonify({"error": "Location not found"}), 404

    data = request.get_json(silent=True) or {}
    name = data["name"].strip() if "name" in data else row["name"]
    try:
        max_occ = int(data["max_occupancy"]) if "max_occupancy" in data else row["max_occupancy"]
    except (ValueError, TypeError):
        max_occ = row["max_occupancy"]
    active = int(bool(data["active"])) if "active" in data else row["active"]

    if max_occ < 1:
        return jsonify({"error": "max_occupancy must be at least 1"}), 400

    db.execute(
        "UPDATE locations SET name = ?, max_occupancy = ?, active = ? WHERE id = ?",
        (name, max_occ, active, loc_id),
    )
    db.commit()
    return jsonify({"id": loc_id, "name": name, "max_occupancy": max_occ, "active": active})

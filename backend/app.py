import os
from flask import Flask, jsonify, send_from_directory
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from werkzeug.exceptions import HTTPException

from backend.routes.auth import auth_bp
from backend.routes.passes import passes_bp
from backend.routes.locations import locations_bp
from backend.routes.admin import admin_bp
from backend.routes.users import users_bp

STATIC_FOLDER = os.path.join(os.path.dirname(__file__), "..", "public")


def create_app():
    app = Flask(__name__, static_folder=STATIC_FOLDER, static_url_path="")
    app.url_map.strict_slashes = False
    CORS(app)

    limiter = Limiter(
        get_remote_address,
        app=app,
        default_limits=["300 per minute"],
        storage_uri="memory://",
    )

    # Stricter limit for auth endpoints
    limiter.limit("20 per 15 minutes")(auth_bp)

    app.register_blueprint(auth_bp, url_prefix="/api/auth")
    app.register_blueprint(passes_bp, url_prefix="/api/passes")
    app.register_blueprint(locations_bp, url_prefix="/api/locations")
    app.register_blueprint(admin_bp, url_prefix="/api/admin")
    app.register_blueprint(users_bp, url_prefix="/api/users")

    @app.get("/api/health")
    def health():
        return jsonify({"status": "ok"})

    # SPA fallback — serve index.html for all non-API routes
    @app.errorhandler(404)
    def not_found(e):
        # Only serve SPA fallback for non-API routes
        if not str(e).startswith("404") or "/api/" not in str(e):
            index = os.path.join(STATIC_FOLDER, "index.html")
            if os.path.exists(index):
                return send_from_directory(STATIC_FOLDER, "index.html")
        return jsonify({"error": "Not found"}), 404

    @app.errorhandler(Exception)
    def handle_error(e):
        # Let HTTP exceptions (like 405, 401, 403) propagate naturally
        if isinstance(e, HTTPException):
            return jsonify({"error": e.description}), e.code
        app.logger.error(e)
        return jsonify({"error": "Internal server error"}), 500

    return app

import os
import functools
import jwt
from datetime import datetime, timezone, timedelta
from flask import request, jsonify

JWT_SECRET = os.environ.get("JWT_SECRET", "hallpass-dev-secret-change-in-production")
JWT_ALGORITHM = "HS256"
JWT_EXPIRES_HOURS = 8


def generate_token(user):
    payload = {
        "id": user["id"],
        "username": user["username"],
        "role": user["role"],
        "display_name": user["display_name"],
        "exp": datetime.now(tz=timezone.utc) + timedelta(hours=JWT_EXPIRES_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def _check_auth():
    """Verify Bearer token. Returns None on success (sets request.user), or a (Response, status) tuple on failure."""
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return jsonify({"error": "Authentication required"}), 401
    token = auth_header[7:]
    try:
        request.user = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return None
    except jwt.ExpiredSignatureError:
        return jsonify({"error": "Invalid or expired token"}), 401
    except jwt.InvalidTokenError:
        return jsonify({"error": "Invalid or expired token"}), 401


def require_auth(f):
    @functools.wraps(f)
    def wrapper(*args, **kwargs):
        err = _check_auth()
        if err is not None:
            return err
        return f(*args, **kwargs)
    return wrapper


def require_role(*roles):
    def decorator(f):
        @functools.wraps(f)
        def wrapper(*args, **kwargs):
            err = _check_auth()
            if err is not None:
                return err
            if request.user.get("role") not in roles:
                return jsonify({"error": "Insufficient permissions"}), 403
            return f(*args, **kwargs)
        return wrapper
    return decorator

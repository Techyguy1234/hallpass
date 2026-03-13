import os
from backend.app import create_app

app = create_app()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    print(f"HallPass server running on http://localhost:{port}")
    print("Default admin login: admin / admin123")
    app.run(host="0.0.0.0", port=port, debug=False)

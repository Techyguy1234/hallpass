"""
Integration tests for the HallPass Flask backend.
Uses an isolated in-memory SQLite database via DB_PATH env var.
"""
import os
import tempfile
import pytest

# Use a temp database for tests
_db_fd, _db_path = tempfile.mkstemp(suffix=".db")
os.environ["DB_PATH"] = _db_path

from backend.app import create_app  # noqa: E402 — must come after env var is set


@pytest.fixture(scope="session")
def client():
    app = create_app()
    app.config["TESTING"] = True
    with app.test_client() as c:
        yield c


@pytest.fixture(scope="session", autouse=True)
def cleanup():
    yield
    try:
        os.close(_db_fd)
        os.unlink(_db_path)
    except Exception:
        pass


# ─── Auth ────────────────────────────────────────────────────────────────────

class TestAuth:
    admin_token = None
    teacher_token = None
    student_token = None
    teacher_id = None

    def test_login_default_admin(self, client):
        res = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
        assert res.status_code == 200
        assert "token" in res.json
        assert res.json["user"]["role"] == "admin"
        TestAuth.admin_token = res.json["token"]

    def test_login_wrong_password(self, client):
        res = client.post("/api/auth/login", json={"username": "admin", "password": "wrong"})
        assert res.status_code == 401

    def test_register_missing_fields(self, client):
        res = client.post("/api/auth/register", json={})
        assert res.status_code == 400

    def test_register_teacher(self, client):
        res = client.post("/api/auth/register", json={
            "username": "teacher1", "password": "pass123",
            "role": "teacher", "display_name": "Ms. Smith",
        })
        assert res.status_code == 201
        assert res.json["role"] == "teacher"
        TestAuth.teacher_id = res.json["id"]

    def test_login_teacher(self, client):
        res = client.post("/api/auth/login", json={"username": "teacher1", "password": "pass123"})
        assert res.status_code == 200
        TestAuth.teacher_token = res.json["token"]

    def test_duplicate_username(self, client):
        res = client.post("/api/auth/register", json={
            "username": "teacher1", "password": "pass123",
            "role": "teacher", "display_name": "Duplicate",
        })
        assert res.status_code == 409


# ─── Admin User Management ───────────────────────────────────────────────────

class TestAdminUsers:
    student_id = None

    def _auth(self):
        return {"Authorization": f"Bearer {TestAuth.admin_token}"}

    def _teacher_auth(self):
        return {"Authorization": f"Bearer {TestAuth.teacher_token}"}

    def test_create_student(self, client):
        res = client.post("/api/admin/users", headers=self._auth(), json={
            "username": "student1", "password": "pass123",
            "role": "student", "display_name": "Alice Johnson",
        })
        assert res.status_code == 201
        TestAdminUsers.student_id = res.json["id"]
        login = client.post("/api/auth/login", json={"username": "student1", "password": "pass123"})
        TestAuth.student_token = login.json["token"]

    def test_teacher_cannot_access_admin_users(self, client):
        res = client.get("/api/admin/users", headers=self._teacher_auth())
        assert res.status_code == 403

    def test_teacher_can_list_students(self, client):
        res = client.get("/api/users/students", headers=self._teacher_auth())
        assert res.status_code == 200
        assert isinstance(res.json, list)
        assert all("password_hash" not in u for u in res.json)

    def test_student_cannot_list_students(self, client):
        res = client.get("/api/users/students",
                         headers={"Authorization": f"Bearer {TestAuth.student_token}"})
        assert res.status_code == 403

    def test_list_all_users_as_admin(self, client):
        res = client.get("/api/admin/users", headers=self._auth())
        assert res.status_code == 200
        assert len(res.json) >= 3

    def test_update_display_name(self, client):
        res = client.patch(f"/api/admin/users/{TestAdminUsers.student_id}",
                           headers=self._auth(),
                           json={"display_name": "Alice Johnson Updated"})
        assert res.status_code == 200
        assert res.json["display_name"] == "Alice Johnson Updated"


# ─── Locations ───────────────────────────────────────────────────────────────

class TestLocations:
    location_id = None

    def _auth(self):
        return {"Authorization": f"Bearer {TestAuth.admin_token}"}

    def _teacher_auth(self):
        return {"Authorization": f"Bearer {TestAuth.teacher_token}"}

    def test_list_locations(self, client):
        res = client.get("/api/locations", headers=self._teacher_auth())
        assert res.status_code == 200
        assert len(res.json) > 0
        TestLocations.location_id = res.json[0]["id"]

    def test_add_location(self, client):
        res = client.post("/api/locations", headers=self._auth(),
                          json={"name": "Test Room", "max_occupancy": 3})
        assert res.status_code == 201
        assert res.json["name"] == "Test Room"
        TestLocations.location_id = res.json["id"]

    def test_teacher_cannot_add_location(self, client):
        res = client.post("/api/locations", headers=self._teacher_auth(),
                          json={"name": "Teacher Room", "max_occupancy": 2})
        assert res.status_code == 403

    def test_duplicate_location(self, client):
        res = client.post("/api/locations", headers=self._auth(),
                          json={"name": "Test Room", "max_occupancy": 1})
        assert res.status_code == 409

    def test_update_location(self, client):
        res = client.patch(f"/api/locations/{TestLocations.location_id}",
                           headers=self._auth(), json={"max_occupancy": 5})
        assert res.status_code == 200
        assert res.json["max_occupancy"] == 5


# ─── Passes ──────────────────────────────────────────────────────────────────

class TestPasses:
    pass_id = None

    def _admin(self):
        return {"Authorization": f"Bearer {TestAuth.admin_token}"}

    def _teacher(self):
        return {"Authorization": f"Bearer {TestAuth.teacher_token}"}

    def _student(self):
        return {"Authorization": f"Bearer {TestAuth.student_token}"}

    def test_issue_pass(self, client):
        res = client.post("/api/passes", headers=self._teacher(), json={
            "student_id": TestAdminUsers.student_id,
            "location_id": TestLocations.location_id,
            "expected_duration_minutes": 5,
        })
        assert res.status_code == 201
        assert res.json["status"] == "active"
        assert "student_name" in res.json
        TestPasses.pass_id = res.json["id"]

    def test_student_cannot_issue_pass(self, client):
        res = client.post("/api/passes", headers=self._student(), json={
            "student_id": TestAdminUsers.student_id,
            "location_id": TestLocations.location_id,
        })
        assert res.status_code == 403

    def test_duplicate_active_pass(self, client):
        res = client.post("/api/passes", headers=self._teacher(), json={
            "student_id": TestAdminUsers.student_id,
            "location_id": TestLocations.location_id,
        })
        assert res.status_code == 409

    def test_student_views_own_passes(self, client):
        res = client.get("/api/passes?status=active", headers=self._student())
        assert res.status_code == 200
        assert len(res.json) == 1
        assert res.json[0]["id"] == TestPasses.pass_id

    def test_active_passes_teacher(self, client):
        res = client.get("/api/passes/active", headers=self._teacher())
        assert res.status_code == 200
        assert any(p["id"] == TestPasses.pass_id for p in res.json)

    def test_stats_teacher(self, client):
        res = client.get("/api/passes/stats", headers=self._teacher())
        assert res.status_code == 200
        assert res.json["active_passes"] >= 1
        assert res.json["passes_today"] >= 1

    def test_student_return_own_pass(self, client):
        res = client.patch(f"/api/passes/{TestPasses.pass_id}/return",
                           headers=self._student(), json={})
        assert res.status_code == 200
        assert res.json["status"] == "returned"

    def test_cannot_return_already_returned(self, client):
        res = client.patch(f"/api/passes/{TestPasses.pass_id}/return",
                           headers=self._student(), json={})
        assert res.status_code == 409

    def test_issue_and_expire(self, client):
        issue = client.post("/api/passes", headers=self._teacher(), json={
            "student_id": TestAdminUsers.student_id,
            "location_id": TestLocations.location_id,
            "expected_duration_minutes": 10,
        })
        assert issue.status_code == 201
        new_id = issue.json["id"]
        expire = client.patch(f"/api/passes/{new_id}/expire",
                              headers=self._admin(), json={})
        assert expire.status_code == 200
        assert expire.json["status"] == "expired"


# ─── Location Capacity ───────────────────────────────────────────────────────

class TestCapacity:
    def _admin(self):
        return {"Authorization": f"Bearer {TestAuth.admin_token}"}

    def _teacher(self):
        return {"Authorization": f"Bearer {TestAuth.teacher_token}"}

    def test_capacity_enforcement(self, client):
        loc = client.post("/api/locations", headers=self._admin(),
                          json={"name": "Tiny Room", "max_occupancy": 1})
        tiny_id = loc.json["id"]

        client.post("/api/auth/register", json={
            "username": "stud2", "password": "pass123",
            "role": "student", "display_name": "Bob",
        })
        client.post("/api/auth/register", json={
            "username": "stud3", "password": "pass123",
            "role": "student", "display_name": "Carol",
        })

        bob_login = client.post("/api/auth/login", json={"username": "stud2", "password": "pass123"})
        carol_login = client.post("/api/auth/login", json={"username": "stud3", "password": "pass123"})
        bob_id = bob_login.json["user"]["id"]
        carol_id = carol_login.json["user"]["id"]

        r1 = client.post("/api/passes", headers=self._teacher(),
                         json={"student_id": bob_id, "location_id": tiny_id})
        assert r1.status_code == 201

        r2 = client.post("/api/passes", headers=self._teacher(),
                         json={"student_id": carol_id, "location_id": tiny_id})
        assert r2.status_code == 409
        assert "capacity" in r2.json["error"].lower()


# ─── Admin Reports ───────────────────────────────────────────────────────────

class TestReports:
    def _admin(self):
        return {"Authorization": f"Bearer {TestAuth.admin_token}"}

    def _student(self):
        return {"Authorization": f"Bearer {TestAuth.student_token}"}

    def test_get_report(self, client):
        res = client.get("/api/admin/report", headers=self._admin())
        assert res.status_code == 200
        assert isinstance(res.json, list)

    def test_report_filtered_by_status(self, client):
        res = client.get("/api/admin/report?status=returned", headers=self._admin())
        assert res.status_code == 200
        assert all(p["status"] == "returned" for p in res.json)

    def test_student_cannot_access_report(self, client):
        res = client.get("/api/admin/report", headers=self._student())
        assert res.status_code == 403


# ─── Unauthenticated access ───────────────────────────────────────────────────

class TestUnauthenticated:
    def test_passes_requires_auth(self, client):
        assert client.get("/api/passes").status_code == 401

    def test_locations_requires_auth(self, client):
        assert client.get("/api/locations").status_code == 401

    def test_health_is_public(self, client):
        res = client.get("/api/health")
        assert res.status_code == 200
        assert res.json["status"] == "ok"

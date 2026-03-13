"""
HallPass — Flet desktop/web frontend.
Connects to a running Flask backend (default http://localhost:5000).

Usage:
    python main.py                      # desktop window
    flet run main.py --web              # browser
    HALLPASS_API=http://my-server:5000 python main.py

Default admin credentials: admin / admin123
"""
import os
import threading
import time
import requests
import flet as ft

API_BASE = os.environ.get("HALLPASS_API", "http://localhost:5000").rstrip("/") + "/api"

# ─── API helpers ─────────────────────────────────────────────────────────────

class APIError(Exception):
    def __init__(self, message, status=None):
        super().__init__(message)
        self.status = status


def api_call(method: str, path: str, token: str | None = None, body=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    url = API_BASE + path
    try:
        resp = getattr(requests, method.lower())(url, json=body, headers=headers, timeout=10)
    except requests.RequestException as exc:
        raise APIError(f"Network error: {exc}") from exc
    if not resp.ok:
        msg = resp.json().get("error", "Request failed") if resp.content else "Request failed"
        raise APIError(msg, status=resp.status_code)
    return resp.json() if resp.content else None


def get(path, token=None):    return api_call("GET",    path, token)
def post(path, body, token=None): return api_call("POST",   path, token, body)
def patch(path, body=None, token=None): return api_call("PATCH", path, token, body or {})


# ─── App state ───────────────────────────────────────────────────────────────

class AppState:
    def __init__(self):
        self.token: str | None = None
        self.user: dict | None = None

    def login(self, token, user):
        self.token = token
        self.user = user

    def logout(self):
        self.token = None
        self.user = None

    @property
    def role(self):
        return self.user["role"] if self.user else None


state = AppState()


# ─── Colour palette ──────────────────────────────────────────────────────────

PRIMARY    = ft.colors.BLUE_600
DANGER     = ft.colors.RED_500
SUCCESS    = ft.colors.GREEN_600
BG         = ft.colors.GREY_100
CARD_BG    = ft.colors.WHITE
MUTED      = ft.colors.GREY_600


# ─── Reusable widgets ────────────────────────────────────────────────────────

def card(*controls, padding=16):
    return ft.Container(
        content=ft.Column(list(controls), spacing=8, tight=True),
        bgcolor=CARD_BG,
        border=ft.border.all(1, ft.colors.GREY_300),
        border_radius=8,
        padding=padding,
        margin=ft.margin.only(bottom=12),
    )


def error_text(msg):
    return ft.Text(msg, color=DANGER, size=13)


def success_text(msg):
    return ft.Text(msg, color=SUCCESS, size=13)


def primary_btn(text, on_click, width=None):
    return ft.ElevatedButton(text, on_click=on_click, width=width, bgcolor=PRIMARY, color=ft.colors.WHITE)


def danger_btn(text, on_click):
    return ft.ElevatedButton(text, on_click=on_click, bgcolor=DANGER, color=ft.colors.WHITE)


def badge(status):
    colour = {
        "active":   ft.colors.GREEN_100,
        "returned": ft.colors.BLUE_100,
        "expired":  ft.colors.RED_100,
    }.get(status, ft.colors.GREY_200)
    text_colour = {
        "active":   ft.colors.GREEN_800,
        "returned": ft.colors.BLUE_800,
        "expired":  ft.colors.RED_800,
    }.get(status, ft.colors.GREY_800)
    return ft.Container(
        content=ft.Text(status, size=11, weight=ft.FontWeight.W_600, color=text_colour),
        bgcolor=colour,
        border_radius=999,
        padding=ft.padding.symmetric(horizontal=8, vertical=3),
    )


def time_since(iso: str) -> str:
    from datetime import datetime, timezone
    dt = datetime.fromisoformat(iso.replace("Z", "+00:00") if iso.endswith("Z") else iso)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    secs = int((datetime.now(tz=timezone.utc) - dt).total_seconds())
    if secs < 60:
        return f"{secs}s ago"
    mins = secs // 60
    if mins < 60:
        return f"{mins}m ago"
    return f"{mins // 60}h {mins % 60}m ago"


# ─── Login view ──────────────────────────────────────────────────────────────

def build_login(page: ft.Page, on_success):
    username = ft.TextField(label="Username", autofocus=True)
    password = ft.TextField(label="Password", password=True, can_reveal_password=True)
    msg = ft.Text("", color=DANGER, size=13)
    btn = primary_btn("Sign In", None)

    def do_login(e):
        msg.value = ""
        btn.disabled = True
        page.update()
        try:
            data = post("/auth/login", {"username": username.value, "password": password.value})
            state.login(data["token"], data["user"])
            on_success()
        except APIError as exc:
            msg.value = str(exc)
        finally:
            btn.disabled = False
            page.update()

    btn.on_click = do_login
    password.on_submit = do_login

    return ft.Column(
        [
            ft.Text("🎫 HallPass", size=28, weight=ft.FontWeight.BOLD, text_align=ft.TextAlign.CENTER),
            ft.Text("Digital Hall Pass Management", size=14, color=MUTED, text_align=ft.TextAlign.CENTER),
            ft.Divider(),
            username,
            password,
            msg,
            primary_btn("Sign In", do_login, width=300),
        ],
        horizontal_alignment=ft.CrossAxisAlignment.CENTER,
        spacing=12,
        width=320,
    )


# ─── Student view ────────────────────────────────────────────────────────────

def build_student(page: ft.Page, on_logout):
    content = ft.Column(scroll=ft.ScrollMode.AUTO)
    status_text = ft.Text("")
    current_pass = None

    def load():
        nonlocal current_pass
        try:
            passes = get("/passes?status=active", state.token)
            current_pass = passes[0] if passes else None
        except APIError as exc:
            status_text.value = str(exc)
            page.update()
            return
        render()

    def render():
        content.controls.clear()
        if current_pass:
            p = current_pass
            return_btn = danger_btn("✅ I've Returned to Class", do_return)
            content.controls += [
                card(
                    ft.Text("You are currently out of class", color=MUTED, size=13),
                    ft.Text(p["location_name"], size=28, weight=ft.FontWeight.BOLD, color=PRIMARY),
                    ft.Text(f"Issued {time_since(p['issued_at'])}", color=MUTED),
                    ft.Text(f"By {p['teacher_name']}", color=MUTED, size=13),
                    return_btn,
                ),
            ]
        else:
            content.controls += [
                card(
                    ft.Text("✅ You're in class!", size=20, weight=ft.FontWeight.W_600),
                    ft.Text("No active hall pass.", color=MUTED),
                )
            ]
        if status_text.value:
            content.controls.insert(0, error_text(status_text.value))
        page.update()

    def do_return(e):
        try:
            patch(f"/passes/{current_pass['id']}/return", token=state.token)
            status_text.value = ""
        except APIError as exc:
            status_text.value = str(exc)
        load()

    load()
    return ft.Column([
        ft.Row([
            ft.Text(f"👋 {state.user['display_name']}", size=16, weight=ft.FontWeight.W_600, expand=True),
            ft.TextButton("Logout", on_click=lambda _: on_logout()),
        ]),
        content,
    ])


# ─── Teacher view ────────────────────────────────────────────────────────────

def build_teacher(page: ft.Page, on_logout):
    tabs_row = ft.Tabs(
        selected_index=0,
        tabs=[
            ft.Tab(text="Issue Pass",   content=build_issue_pass(page)),
            ft.Tab(text="Active Passes",content=build_active_passes(page, ("admin", "teacher"))),
            ft.Tab(text="History",      content=build_history(page)),
        ],
        expand=True,
    )
    return ft.Column([
        ft.Row([
            ft.Text(f"👋 {state.user['display_name']} (Teacher)", size=16, weight=ft.FontWeight.W_600, expand=True),
            ft.TextButton("Logout", on_click=lambda _: on_logout()),
        ]),
        tabs_row,
    ], expand=True)


# ─── Admin view ──────────────────────────────────────────────────────────────

def build_admin(page: ft.Page, on_logout):
    tabs_row = ft.Tabs(
        selected_index=0,
        tabs=[
            ft.Tab(text="Dashboard",   content=build_dashboard(page)),
            ft.Tab(text="Passes",      content=build_active_passes(page, ("admin", "teacher"))),
            ft.Tab(text="Users",       content=build_users(page)),
            ft.Tab(text="Locations",   content=build_locations(page)),
            ft.Tab(text="Reports",     content=build_reports(page)),
        ],
        expand=True,
    )
    return ft.Column([
        ft.Row([
            ft.Text(f"👋 {state.user['display_name']} (Admin)", size=16, weight=ft.FontWeight.W_600, expand=True),
            ft.TextButton("Logout", on_click=lambda _: on_logout()),
        ]),
        tabs_row,
    ], expand=True)


# ─── Dashboard tab ────────────────────────────────────────────────────────────

def build_dashboard(page):
    content = ft.Column(scroll=ft.ScrollMode.AUTO)

    def load():
        try:
            stats = get("/passes/stats", state.token)
        except APIError as exc:
            content.controls = [error_text(str(exc))]
            page.update()
            return

        rows = [
            ft.DataRow(cells=[
                ft.DataCell(ft.Text(loc["name"])),
                ft.DataCell(ft.Text(str(loc["current_occupancy"]))),
                ft.DataCell(ft.Text(str(loc["max_occupancy"]))),
            ])
            for loc in stats["locations"]
        ]

        content.controls = [
            ft.Row([
                ft.Container(
                    ft.Column([ft.Text(str(stats["active_passes"]), size=36, weight=ft.FontWeight.BOLD, color=PRIMARY),
                               ft.Text("Active Passes", color=MUTED, size=13)], horizontal_alignment=ft.CrossAxisAlignment.CENTER),
                    bgcolor=CARD_BG, border=ft.border.all(1, ft.colors.GREY_300), border_radius=8, padding=20,
                ),
                ft.Container(
                    ft.Column([ft.Text(str(stats["passes_today"]), size=36, weight=ft.FontWeight.BOLD, color=PRIMARY),
                               ft.Text("Passes Today", color=MUTED, size=13)], horizontal_alignment=ft.CrossAxisAlignment.CENTER),
                    bgcolor=CARD_BG, border=ft.border.all(1, ft.colors.GREY_300), border_radius=8, padding=20,
                ),
            ], spacing=12),
            ft.DataTable(
                columns=[
                    ft.DataColumn(ft.Text("Location")),
                    ft.DataColumn(ft.Text("Current"), numeric=True),
                    ft.DataColumn(ft.Text("Max"),     numeric=True),
                ],
                rows=rows,
            ),
        ]
        page.update()

    load()
    return ft.Container(content=content, padding=12)


# ─── Issue Pass tab ──────────────────────────────────────────────────────────

def build_issue_pass(page):
    students_dd  = ft.Dropdown(label="Student",     expand=True)
    locations_dd = ft.Dropdown(label="Destination", expand=True)
    duration_tf  = ft.TextField(label="Duration (minutes)", value="10", keyboard_type=ft.KeyboardType.NUMBER, width=160)
    notes_tf     = ft.TextField(label="Notes (optional)", expand=True)
    msg          = ft.Text("")
    btn          = primary_btn("Issue Pass", None)

    def load_data():
        try:
            studs = get("/users/students", state.token)
            locs  = get("/locations",      state.token)
            students_dd.options  = [ft.dropdown.Option(str(s["id"]), s["display_name"]) for s in studs]
            locations_dd.options = [ft.dropdown.Option(str(l["id"]), f"{l['name']} ({l['current_occupancy']}/{l['max_occupancy']})") for l in locs]
            page.update()
        except APIError:
            pass

    def do_issue(e):
        msg.value = ""
        if not students_dd.value or not locations_dd.value:
            msg.value = "Please select a student and destination."
            msg.color = DANGER
            page.update()
            return
        btn.disabled = True
        page.update()
        try:
            p = post("/passes", {
                "student_id":               int(students_dd.value),
                "location_id":              int(locations_dd.value),
                "expected_duration_minutes": int(duration_tf.value or 10),
                "notes":                    notes_tf.value or None,
            }, state.token)
            msg.value = f"✅ Pass issued for {p['student_name']} → {p['location_name']}"
            msg.color = SUCCESS
            students_dd.value = None
            notes_tf.value    = ""
            load_data()
        except APIError as exc:
            msg.value = str(exc)
            msg.color = DANGER
        finally:
            btn.disabled = False
            page.update()

    btn.on_click = do_issue
    load_data()

    return ft.Container(
        content=ft.Column([
            ft.Text("Issue Hall Pass", size=18, weight=ft.FontWeight.W_600),
            students_dd, locations_dd,
            ft.Row([duration_tf, notes_tf]),
            msg, btn,
        ], spacing=10),
        padding=12,
    )


# ─── Active Passes tab ───────────────────────────────────────────────────────

def build_active_passes(page, roles):
    content = ft.Column(scroll=ft.ScrollMode.AUTO)

    def load():
        try:
            passes = get("/passes/active", state.token)
        except APIError as exc:
            content.controls = [error_text(str(exc))]
            page.update()
            return

        def make_row(p):
            return ft.Row([
                ft.Text(p["student_name"],  expand=2),
                ft.Text(p["location_name"], expand=2),
                ft.Text(time_since(p["issued_at"]), expand=1, color=MUTED),
                ft.ElevatedButton("Return", on_click=lambda _, pid=p["id"]: do_action(pid, "return"),
                                  bgcolor=SUCCESS, color=ft.colors.WHITE),
                ft.ElevatedButton("Expire", on_click=lambda _, pid=p["id"]: do_action(pid, "expire"),
                                  bgcolor=DANGER, color=ft.colors.WHITE),
            ])

        if passes:
            content.controls = [make_row(p) for p in passes]
        else:
            content.controls = [ft.Text("No active passes.", color=MUTED)]
        page.update()

    def do_action(pass_id, action):
        try:
            patch(f"/passes/{pass_id}/{action}", token=state.token)
        except APIError as exc:
            content.controls.insert(0, error_text(str(exc)))
        load()

    load()
    return ft.Container(
        content=ft.Column([
            ft.Row([
                ft.Text("Active Passes", size=18, weight=ft.FontWeight.W_600, expand=True),
                ft.IconButton(ft.icons.REFRESH, on_click=lambda _: load()),
            ]),
            content,
        ], spacing=8),
        padding=12,
    )


# ─── History tab ──────────────────────────────────────────────────────────────

def build_history(page):
    content = ft.Column(scroll=ft.ScrollMode.AUTO)

    def load():
        try:
            passes = get("/passes", state.token)
        except APIError as exc:
            content.controls = [error_text(str(exc))]
            page.update()
            return

        rows = [
            ft.DataRow(cells=[
                ft.DataCell(ft.Text(p["student_name"])),
                ft.DataCell(ft.Text(p["location_name"])),
                ft.DataCell(badge(p["status"])),
                ft.DataCell(ft.Text(p["issued_at"][:16])),
            ])
            for p in passes
        ]
        content.controls = [
            ft.DataTable(
                columns=[
                    ft.DataColumn(ft.Text("Student")),
                    ft.DataColumn(ft.Text("Location")),
                    ft.DataColumn(ft.Text("Status")),
                    ft.DataColumn(ft.Text("Issued")),
                ],
                rows=rows,
            )
        ] if rows else [ft.Text("No history.", color=MUTED)]
        page.update()

    load()
    return ft.Container(content=ft.Column([
        ft.Row([
            ft.Text("Pass History", size=18, weight=ft.FontWeight.W_600, expand=True),
            ft.IconButton(ft.icons.REFRESH, on_click=lambda _: load()),
        ]),
        content,
    ], spacing=8), padding=12)


# ─── Users tab (admin) ────────────────────────────────────────────────────────

def build_users(page):
    content = ft.Column(scroll=ft.ScrollMode.AUTO)
    username_tf = ft.TextField(label="Username")
    password_tf = ft.TextField(label="Password", password=True, can_reveal_password=True)
    display_tf  = ft.TextField(label="Display Name")
    role_dd     = ft.Dropdown(label="Role", options=[
        ft.dropdown.Option("student", "Student"),
        ft.dropdown.Option("teacher", "Teacher"),
        ft.dropdown.Option("admin",   "Admin"),
    ], value="student")
    form_msg    = ft.Text("")

    def load():
        try:
            users = get("/admin/users", state.token)
        except APIError as exc:
            content.controls = [error_text(str(exc))]
            page.update()
            return

        def make_row(u):
            return ft.Row([
                ft.Text(u["username"],     expand=2),
                ft.Text(u["display_name"], expand=2),
                ft.Text(u["role"],         expand=1),
                ft.ElevatedButton("Delete", on_click=lambda _, uid=u["id"], uname=u["username"]: do_delete(uid, uname),
                                  bgcolor=DANGER, color=ft.colors.WHITE),
            ])

        content.controls = [make_row(u) for u in users] or [ft.Text("No users.", color=MUTED)]
        page.update()

    def do_create(e):
        form_msg.value = ""
        try:
            post("/admin/users", {
                "username": username_tf.value, "password": password_tf.value,
                "role": role_dd.value, "display_name": display_tf.value,
            }, state.token)
            form_msg.value = f"✅ User '{username_tf.value}' created."
            form_msg.color = SUCCESS
            username_tf.value = password_tf.value = display_tf.value = ""
            load()
        except APIError as exc:
            form_msg.value = str(exc)
            form_msg.color = DANGER
            page.update()

    def do_delete(uid, uname):
        try:
            api_call("DELETE", f"/admin/users/{uid}", state.token)
            load()
        except APIError as exc:
            content.controls.insert(0, error_text(str(exc)))
            page.update()

    load()

    return ft.Container(
        content=ft.Column([
            ft.Text("Create User", size=18, weight=ft.FontWeight.W_600),
            username_tf, password_tf, display_tf, role_dd, form_msg,
            primary_btn("Create User", do_create),
            ft.Divider(),
            ft.Text("All Users", size=18, weight=ft.FontWeight.W_600),
            content,
        ], spacing=8, scroll=ft.ScrollMode.AUTO),
        padding=12,
    )


# ─── Locations tab (admin) ───────────────────────────────────────────────────

def build_locations(page):
    content = ft.Column(scroll=ft.ScrollMode.AUTO)
    name_tf   = ft.TextField(label="Location Name", expand=True)
    maxocc_tf = ft.TextField(label="Max Occupancy", value="3", keyboard_type=ft.KeyboardType.NUMBER, width=140)
    loc_msg   = ft.Text("")

    def load():
        try:
            locs = get("/locations", state.token)
        except APIError as exc:
            content.controls = [error_text(str(exc))]
            page.update()
            return

        def make_row(l):
            return ft.Row([
                ft.Text(l["name"],              expand=3),
                ft.Text(f"{l['current_occupancy']}/{l['max_occupancy']}", expand=1, color=MUTED),
            ])

        content.controls = [make_row(l) for l in locs] or [ft.Text("No locations.", color=MUTED)]
        page.update()

    def do_create(e):
        loc_msg.value = ""
        try:
            post("/locations", {"name": name_tf.value, "max_occupancy": int(maxocc_tf.value or 3)}, state.token)
            loc_msg.value = f"✅ Location '{name_tf.value}' created."
            loc_msg.color = SUCCESS
            name_tf.value = ""
            load()
        except APIError as exc:
            loc_msg.value = str(exc)
            loc_msg.color = DANGER
            page.update()

    load()
    return ft.Container(
        content=ft.Column([
            ft.Text("Add Location", size=18, weight=ft.FontWeight.W_600),
            ft.Row([name_tf, maxocc_tf]),
            loc_msg,
            primary_btn("Add Location", do_create),
            ft.Divider(),
            ft.Text("All Locations", size=18, weight=ft.FontWeight.W_600),
            content,
        ], spacing=8),
        padding=12,
    )


# ─── Reports tab (admin) ─────────────────────────────────────────────────────

def build_reports(page):
    content = ft.Column(scroll=ft.ScrollMode.AUTO)
    status_dd = ft.Dropdown(label="Status", options=[
        ft.dropdown.Option("", "All"),
        ft.dropdown.Option("active",   "Active"),
        ft.dropdown.Option("returned", "Returned"),
        ft.dropdown.Option("expired",  "Expired"),
    ], value="")

    def load(e=None):
        params = ""
        if status_dd.value:
            params = f"?status={status_dd.value}"
        try:
            passes = get(f"/admin/report{params}", state.token)
        except APIError as exc:
            content.controls = [error_text(str(exc))]
            page.update()
            return

        rows = [
            ft.DataRow(cells=[
                ft.DataCell(ft.Text(p["student_name"])),
                ft.DataCell(ft.Text(p["location_name"])),
                ft.DataCell(ft.Text(p["teacher_name"])),
                ft.DataCell(badge(p["status"])),
                ft.DataCell(ft.Text(p["issued_at"][:16])),
            ])
            for p in passes
        ]
        content.controls = [
            ft.DataTable(
                columns=[
                    ft.DataColumn(ft.Text("Student")),
                    ft.DataColumn(ft.Text("Location")),
                    ft.DataColumn(ft.Text("Teacher")),
                    ft.DataColumn(ft.Text("Status")),
                    ft.DataColumn(ft.Text("Issued")),
                ],
                rows=rows,
            )
        ] if rows else [ft.Text("No records.", color=MUTED)]
        page.update()

    load()
    return ft.Container(
        content=ft.Column([
            ft.Text("Reports", size=18, weight=ft.FontWeight.W_600),
            ft.Row([status_dd, primary_btn("Apply", load)], spacing=8),
            content,
        ], spacing=8),
        padding=12,
    )


# ─── Main ─────────────────────────────────────────────────────────────────────

def main(page: ft.Page):
    page.title = "🎫 HallPass"
    page.bgcolor = BG
    page.window_width  = 1000
    page.window_height = 700
    page.padding = 20

    def render():
        page.controls.clear()
        if not state.user:
            page.controls.append(
                ft.Row([build_login(page, on_success=render)], alignment=ft.MainAxisAlignment.CENTER)
            )
        elif state.role == "admin":
            page.controls.append(build_admin(page, on_logout=lambda: (state.logout(), render())))
        elif state.role == "teacher":
            page.controls.append(build_teacher(page, on_logout=lambda: (state.logout(), render())))
        elif state.role == "student":
            page.controls.append(build_student(page, on_logout=lambda: (state.logout(), render())))
        page.update()

    render()


if __name__ == "__main__":
    ft.app(target=main)

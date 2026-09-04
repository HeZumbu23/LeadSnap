#!/usr/bin/env python3
"""LeadSnap auth API: self-service registration, login, logout, session check.

Each registration creates a new tenant (Mandant) - a fully isolated
workspace. Every other CGI script scopes its data by the tenant_id
found in the caller's session cookie.
"""
import os
import sys
import json
import uuid
import sqlite3
from datetime import datetime, timezone
from urllib.parse import parse_qs

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "lib"))
import auth_lib  # noqa: E402

APP_NAME = "leadsnap"


def log(level, message):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{ts}] [{APP_NAME}] [{level}] {message}", file=sys.stderr, flush=True)


def send(status, obj, extra_headers=None):
    body = json.dumps(obj).encode("utf-8")
    print(f"Status: {status}")
    print("Content-Type: application/json; charset=utf-8")
    print(f"Content-Length: {len(body)}")
    for header in extra_headers or []:
        print(header)
    print()
    sys.stdout.flush()
    sys.stdout.buffer.write(body)


def read_json_body():
    try:
        length = int(os.environ.get("CONTENT_LENGTH", 0) or 0)
    except ValueError:
        length = 0
    if length <= 0:
        return {}
    raw = sys.stdin.buffer.read(length)
    if not raw:
        return {}
    return json.loads(raw.decode("utf-8"))


def default_tenant_name(email):
    domain = email.split("@")[-1] if "@" in email else ""
    root = domain.split(".")[0] if domain else ""
    return root.capitalize() if root else "Mein Team"


def action_register():
    payload = read_json_body()
    email = auth_lib.normalize_email(payload.get("email"))
    password = payload.get("password") or ""
    tenant_name = (payload.get("tenant_name") or "").strip() or default_tenant_name(email)

    if not auth_lib.valid_email(email):
        send(400, {"ok": False, "error": "Bitte eine gültige E-Mail-Adresse angeben."})
        return
    if len(password) < 8:
        send(400, {"ok": False, "error": "Das Passwort muss mindestens 8 Zeichen haben."})
        return

    conn = auth_lib.get_db()
    existing = conn.execute("SELECT id FROM users WHERE email=?", (email,)).fetchone()
    if existing:
        conn.close()
        send(409, {"ok": False, "error": "Für diese E-Mail-Adresse existiert bereits ein Konto."})
        return

    tenant_id = str(uuid.uuid4())
    user_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    salt, pw_hash = auth_lib.hash_password(password)

    conn.execute(
        "INSERT INTO tenants (id, name, created_at) VALUES (?,?,?)",
        (tenant_id, tenant_name, now),
    )
    conn.execute(
        """INSERT INTO users (id, tenant_id, email, password_hash, password_salt, role, created_at)
           VALUES (?,?,?,?,?,?,?)""",
        (user_id, tenant_id, email, pw_hash, salt, "owner", now),
    )
    token = auth_lib.create_session(conn, user_id, tenant_id)
    conn.commit()
    conn.close()

    log("INFO", f"registered new tenant {tenant_id} ({tenant_name}) with user {email}")
    send(
        200,
        {"ok": True, "email": email, "tenant_name": tenant_name},
        [auth_lib.session_cookie_header(token)],
    )


def action_login():
    payload = read_json_body()
    email = auth_lib.normalize_email(payload.get("email"))
    password = payload.get("password") or ""

    conn = auth_lib.get_db()
    row = conn.execute(
        """SELECT u.id, u.password_hash, u.password_salt, u.tenant_id, t.name AS tenant_name
           FROM users u JOIN tenants t ON t.id = u.tenant_id
           WHERE u.email=?""",
        (email,),
    ).fetchone()
    conn.close()

    if not row or not auth_lib.verify_password(password, row["password_salt"], row["password_hash"]):
        log("WARN", f"failed login attempt for {email}")
        send(401, {"ok": False, "error": "E-Mail oder Passwort ist falsch."})
        return

    conn = auth_lib.get_db()
    token = auth_lib.create_session(conn, row["id"], row["tenant_id"])
    conn.commit()
    conn.close()

    log("INFO", f"login for {email} (tenant {row['tenant_id']})")
    send(
        200,
        {"ok": True, "email": email, "tenant_name": row["tenant_name"]},
        [auth_lib.session_cookie_header(token)],
    )


def action_logout():
    cookies = auth_lib.parse_cookies()
    token = cookies.get(auth_lib.COOKIE_NAME)
    if token:
        conn = auth_lib.get_db()
        conn.execute("DELETE FROM sessions WHERE token=?", (token,))
        conn.commit()
        conn.close()
    send(200, {"ok": True}, [auth_lib.clear_cookie_header()])


def action_me():
    session = auth_lib.current_session()
    if not session:
        send(401, {"ok": False, "error": "not authenticated"})
        return
    conn = auth_lib.get_db()
    tenant = conn.execute("SELECT name FROM tenants WHERE id=?", (session["tenant_id"],)).fetchone()
    conn.close()
    send(200, {
        "ok": True,
        "email": session["email"],
        "tenant_id": session["tenant_id"],
        "tenant_name": tenant["name"] if tenant else "",
        "is_admin": auth_lib.is_admin(session["email"]),
    })


def main():
    method = os.environ.get("REQUEST_METHOD", "GET")
    query = os.environ.get("QUERY_STRING", "")
    params = parse_qs(query)
    action = params.get("action", ["me" if method == "GET" else ""])[0]

    try:
        if action == "register":
            action_register()
        elif action == "login":
            action_login()
        elif action == "logout":
            action_logout()
        elif action == "me":
            action_me()
        else:
            send(400, {"ok": False, "error": f"unknown action '{action}'"})
    except sqlite3.IntegrityError:
        send(409, {"ok": False, "error": "Für diese E-Mail-Adresse existiert bereits ein Konto."})
    except Exception as exc:  # noqa: BLE001
        log("ERROR", f"unhandled exception: {exc}")
        send(500, {"ok": False, "error": str(exc)})


if __name__ == "__main__":
    main()

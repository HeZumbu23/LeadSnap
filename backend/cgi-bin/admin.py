#!/usr/bin/env python3
"""LeadSnap admin API: platform-wide stats for the hardcoded admin account.

Read-only cross-tenant view (tenant/user/event/contact counts) used by
the "Backend" tab that only shows up for auth_lib.ADMIN_EMAILS.
"""
import os
import sys
import json
import sqlite3
from datetime import datetime
from urllib.parse import parse_qs

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "lib"))
import auth_lib  # noqa: E402

APP_NAME = "leadsnap"


def log(level, message):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{ts}] [{APP_NAME}] [{level}] {message}", file=sys.stderr, flush=True)


def send(status, obj):
    body = json.dumps(obj).encode("utf-8")
    print(f"Status: {status}")
    print("Content-Type: application/json; charset=utf-8")
    print(f"Content-Length: {len(body)}")
    print()
    sys.stdout.flush()
    sys.stdout.buffer.write(body)


def count(conn, table):
    try:
        return conn.execute(f"SELECT COUNT(*) AS c FROM {table}").fetchone()["c"]
    except sqlite3.OperationalError:
        return 0  # table not created yet - nothing stored there so far


def action_stats():
    conn = auth_lib.get_db()
    tenants = conn.execute(
        """SELECT t.id, t.name, t.created_at,
                  (SELECT COUNT(*) FROM users u WHERE u.tenant_id = t.id) AS user_count,
                  (SELECT COUNT(*) FROM events e WHERE e.tenant_id = t.id) AS event_count
           FROM tenants t ORDER BY t.created_at DESC"""
    ).fetchall()

    contact_counts = {}
    try:
        rows = conn.execute(
            "SELECT tenant_id, COUNT(*) AS c FROM contacts GROUP BY tenant_id"
        ).fetchall()
        contact_counts = {r["tenant_id"]: r["c"] for r in rows}
    except sqlite3.OperationalError:
        pass

    tenant_list = []
    for t in tenants:
        tenant_list.append({
            "id": t["id"],
            "name": t["name"],
            "created_at": t["created_at"],
            "user_count": t["user_count"],
            "event_count": t["event_count"],
            "contact_count": contact_counts.get(t["id"], 0),
        })

    totals = {
        "tenants": count(conn, "tenants"),
        "users": count(conn, "users"),
        "events": count(conn, "events"),
        "contacts": count(conn, "contacts"),
    }
    conn.close()
    send(200, {"ok": True, "totals": totals, "tenants": tenant_list})


def main():
    session = auth_lib.current_session()
    if not session:
        send(401, {"ok": False, "error": "not authenticated"})
        return
    if not auth_lib.is_admin(session["email"]):
        log("WARN", f"non-admin {session['email']} tried to access admin stats")
        send(403, {"ok": False, "error": "admin access required"})
        return

    query = os.environ.get("QUERY_STRING", "")
    params = parse_qs(query)
    action = params.get("action", ["stats"])[0]

    try:
        if action == "stats":
            action_stats()
        else:
            send(400, {"ok": False, "error": f"unknown action '{action}'"})
    except Exception as exc:  # noqa: BLE001
        log("ERROR", f"unhandled exception: {exc}")
        send(500, {"ok": False, "error": str(exc)})


if __name__ == "__main__":
    main()

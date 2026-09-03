#!/usr/bin/env python3
"""LeadSnap events API: list / create / rename / archive trade-show events."""
import os
import sys
import json
import sqlite3
import uuid
from datetime import datetime, timezone
from urllib.parse import parse_qs

APP_NAME = "leadsnap"


def log(level, message):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{ts}] [{APP_NAME}] [{level}] {message}", file=sys.stderr, flush=True)


def data_dir():
    return os.environ.get("APP_DATA_DIR", ".")


def db_path():
    return os.path.join(data_dir(), "leadsnap.db")


def get_db():
    conn = sqlite3.connect(db_path())
    conn.row_factory = sqlite3.Row
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS events (
            id TEXT PRIMARY KEY,
            name TEXT,
            location TEXT,
            start_date TEXT,
            end_date TEXT,
            archived INTEGER DEFAULT 0,
            created_at TEXT
        )
        """
    )
    return conn


def send(status, obj):
    body = json.dumps(obj).encode("utf-8")
    print(f"Status: {status}")
    print("Content-Type: application/json; charset=utf-8")
    print(f"Content-Length: {len(body)}")
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


def row_to_dict(row):
    d = {k: row[k] for k in row.keys()}
    d["archived"] = bool(d.get("archived"))
    return d


def action_list():
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM events ORDER BY archived ASC, created_at DESC"
    ).fetchall()
    conn.close()
    send(200, {"ok": True, "events": [row_to_dict(r) for r in rows]})


def action_create():
    payload = read_json_body()
    name = (payload.get("name") or "").strip()
    if not name:
        send(400, {"ok": False, "error": "name is required"})
        return

    conn = get_db()
    event_id = str(uuid.uuid4())
    created_at = datetime.now(timezone.utc).isoformat()
    conn.execute(
        """INSERT INTO events (id, name, location, start_date, end_date, archived, created_at)
           VALUES (?,?,?,?,?,0,?)""",
        (
            event_id,
            name,
            payload.get("location", ""),
            payload.get("start_date", ""),
            payload.get("end_date", ""),
            created_at,
        ),
    )
    conn.commit()
    conn.close()
    log("INFO", f"created event {event_id} ({name})")
    send(200, {"ok": True, "id": event_id})


def action_update():
    payload = read_json_body()
    event_id = payload.get("id")
    if not event_id:
        send(400, {"ok": False, "error": "id is required"})
        return
    conn = get_db()
    existing = conn.execute("SELECT id FROM events WHERE id=?", (event_id,)).fetchone()
    if not existing:
        conn.close()
        send(404, {"ok": False, "error": "event not found"})
        return
    conn.execute(
        """UPDATE events SET name=?, location=?, start_date=?, end_date=?, archived=?
           WHERE id=?""",
        (
            (payload.get("name") or "").strip(),
            payload.get("location", ""),
            payload.get("start_date", ""),
            payload.get("end_date", ""),
            1 if payload.get("archived") else 0,
            event_id,
        ),
    )
    conn.commit()
    conn.close()
    log("INFO", f"updated event {event_id}")
    send(200, {"ok": True})


def action_delete():
    payload = read_json_body()
    event_id = payload.get("id")
    if not event_id:
        send(400, {"ok": False, "error": "id is required"})
        return
    conn = get_db()
    conn.execute("DELETE FROM events WHERE id=?", (event_id,))
    try:
        conn.execute("DELETE FROM contacts WHERE event_id=?", (event_id,))
    except sqlite3.OperationalError:
        pass  # contacts table not created yet - nothing to delete
    conn.commit()
    conn.close()
    log("WARN", f"deleted event {event_id} and its contacts")
    send(200, {"ok": True})


def main():
    method = os.environ.get("REQUEST_METHOD", "GET")
    query = os.environ.get("QUERY_STRING", "")
    params = parse_qs(query)
    action = params.get("action", ["list" if method == "GET" else ""])[0]

    try:
        if action == "list":
            action_list()
        elif action == "create":
            action_create()
        elif action == "update":
            action_update()
        elif action == "delete":
            action_delete()
        else:
            send(400, {"ok": False, "error": f"unknown action '{action}'"})
    except Exception as exc:  # noqa: BLE001
        log("ERROR", f"unhandled exception: {exc}")
        send(500, {"ok": False, "error": str(exc)})


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""LeadSnap contacts API: list / save / delete / export as JSON over CGI."""
import os
import sys
import json
import sqlite3
import uuid
import csv
import io
from datetime import datetime, timezone

APP_NAME = "leadsnap"


def log(level, message):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    stream = sys.stderr if level == "ERROR" else sys.stdout
    print(f"[{ts}] [{APP_NAME}] [{level}] {message}", file=stream, flush=True)


def data_dir():
    return os.environ.get("APP_DATA_DIR", ".")


def db_path():
    return os.path.join(data_dir(), "leadsnap.db")


def get_db():
    conn = sqlite3.connect(db_path())
    conn.row_factory = sqlite3.Row
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS contacts (
            id TEXT PRIMARY KEY,
            name TEXT,
            company TEXT,
            position TEXT,
            phone TEXT,
            email TEXT,
            topic TEXT,
            notes TEXT,
            priority TEXT,
            photo TEXT,
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


def send_file(status, content_type, filename, body_bytes):
    print(f"Status: {status}")
    print(f"Content-Type: {content_type}; charset=utf-8")
    print(f'Content-Disposition: attachment; filename="{filename}"')
    print(f"Content-Length: {len(body_bytes)}")
    print()
    sys.stdout.flush()
    sys.stdout.buffer.write(body_bytes)


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
    return {k: row[k] for k in row.keys()}


def action_list():
    conn = get_db()
    rows = conn.execute("SELECT * FROM contacts ORDER BY created_at DESC").fetchall()
    conn.close()
    send(200, {"ok": True, "contacts": [row_to_dict(r) for r in rows]})


def action_save():
    payload = read_json_body()
    name = (payload.get("name") or "").strip()
    if not name:
        send(400, {"ok": False, "error": "name is required"})
        return

    conn = get_db()
    contact_id = payload.get("id") or str(uuid.uuid4())
    existing = conn.execute("SELECT id FROM contacts WHERE id=?", (contact_id,)).fetchone()
    created_at = payload.get("created_at") or datetime.now(timezone.utc).isoformat()

    fields = (
        contact_id,
        name,
        payload.get("company", ""),
        payload.get("position", ""),
        payload.get("phone", ""),
        payload.get("email", ""),
        payload.get("topic", ""),
        payload.get("notes", ""),
        payload.get("priority", "normal"),
        payload.get("photo", ""),
        created_at,
    )

    if existing:
        conn.execute(
            """UPDATE contacts SET name=?, company=?, position=?, phone=?, email=?,
               topic=?, notes=?, priority=?, photo=? WHERE id=?""",
            fields[1:10] + (contact_id,),
        )
    else:
        conn.execute(
            """INSERT INTO contacts
               (id, name, company, position, phone, email, topic, notes, priority, photo, created_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
            fields,
        )
    conn.commit()
    conn.close()
    log("INFO", f"saved contact {contact_id} ({name})")
    send(200, {"ok": True, "id": contact_id})


def action_delete():
    payload = read_json_body()
    contact_id = payload.get("id")
    if not contact_id:
        send(400, {"ok": False, "error": "id is required"})
        return
    conn = get_db()
    conn.execute("DELETE FROM contacts WHERE id=?", (contact_id,))
    conn.commit()
    conn.close()
    log("INFO", f"deleted contact {contact_id}")
    send(200, {"ok": True})


def action_clear_all():
    conn = get_db()
    conn.execute("DELETE FROM contacts")
    conn.commit()
    conn.close()
    log("WARN", "cleared all contacts")
    send(200, {"ok": True})


def action_export_csv():
    conn = get_db()
    rows = conn.execute("SELECT * FROM contacts ORDER BY created_at DESC").fetchall()
    conn.close()
    buf = io.StringIO()
    fieldnames = [
        "name", "company", "position", "phone", "email",
        "topic", "notes", "priority", "created_at",
    ]
    writer = csv.DictWriter(buf, fieldnames=fieldnames)
    writer.writeheader()
    for r in rows:
        writer.writerow({k: r[k] for k in fieldnames})
    data = buf.getvalue().encode("utf-8-sig")
    send_file(200, "text/csv", "leadsnap-kontakte.csv", data)


def vcard_escape(value):
    return (value or "").replace("\\", "\\\\").replace(",", "\\,").replace(";", "\\;").replace("\n", "\\n")


def action_export_vcf():
    conn = get_db()
    rows = conn.execute("SELECT * FROM contacts ORDER BY created_at DESC").fetchall()
    conn.close()
    lines = []
    for r in rows:
        notes_parts = []
        if r["topic"]:
            notes_parts.append(f"Thema: {r['topic']}")
        if r["notes"]:
            notes_parts.append(r["notes"])
        note_text = " | ".join(notes_parts)
        lines.append("BEGIN:VCARD")
        lines.append("VERSION:3.0")
        lines.append(f"FN:{vcard_escape(r['name'])}")
        lines.append(f"ORG:{vcard_escape(r['company'])}")
        lines.append(f"TITLE:{vcard_escape(r['position'])}")
        if r["phone"]:
            lines.append(f"TEL;TYPE=CELL:{vcard_escape(r['phone'])}")
        if r["email"]:
            lines.append(f"EMAIL:{vcard_escape(r['email'])}")
        if note_text:
            lines.append(f"NOTE:{vcard_escape(note_text)}")
        lines.append("END:VCARD")
    data = ("\n".join(lines) + "\n").encode("utf-8")
    send_file(200, "text/vcard", "leadsnap-kontakte.vcf", data)


def main():
    method = os.environ.get("REQUEST_METHOD", "GET")
    query = os.environ.get("QUERY_STRING", "")
    params = {}
    for part in query.split("&"):
        if "=" in part:
            k, v = part.split("=", 1)
            params[k] = v
    action = params.get("action", "list" if method == "GET" else "")

    try:
        if action == "list":
            action_list()
        elif action == "save":
            action_save()
        elif action == "delete":
            action_delete()
        elif action == "clear_all":
            action_clear_all()
        elif action == "export_csv":
            action_export_csv()
        elif action == "export_vcf":
            action_export_vcf()
        else:
            send(400, {"ok": False, "error": f"unknown action '{action}'"})
    except Exception as exc:  # noqa: BLE001
        log("ERROR", f"unhandled exception: {exc}")
        send(500, {"ok": False, "error": str(exc)})


if __name__ == "__main__":
    main()

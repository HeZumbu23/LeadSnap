#!/usr/bin/env python3
"""LeadSnap contacts API: list / save / delete / export as JSON over CGI.

Contacts belong to an event (Messe), identified by event_id. See
events.py for creating/listing events.
"""
import os
import sys
import json
import sqlite3
import uuid
import csv
import io
from datetime import datetime, timezone
from urllib.parse import parse_qs

APP_NAME = "leadsnap"


def log(level, message):
    # stdout is the CGI response channel - all log levels must go to stderr
    # or they corrupt the HTTP header block and Apache returns a bare 500.
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
        CREATE TABLE IF NOT EXISTS contacts (
            id TEXT PRIMARY KEY,
            event_id TEXT,
            name TEXT,
            company TEXT,
            position TEXT,
            phone TEXT,
            email TEXT,
            address TEXT,
            topic TEXT,
            notes TEXT,
            priority TEXT,
            photo TEXT,
            latitude REAL,
            longitude REAL,
            location_accuracy REAL,
            created_at TEXT
        )
        """
    )
    existing_cols = {row["name"] for row in conn.execute("PRAGMA table_info(contacts)")}
    for col, coltype in (
        ("event_id", "TEXT"),
        ("address", "TEXT"),
        ("latitude", "REAL"),
        ("longitude", "REAL"),
        ("location_accuracy", "REAL"),
    ):
        if col not in existing_cols:
            conn.execute(f"ALTER TABLE contacts ADD COLUMN {col} {coltype}")
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
    safe_filename = filename.replace('"', "")
    print(f"Status: {status}")
    print(f"Content-Type: {content_type}; charset=utf-8")
    print(f'Content-Disposition: attachment; filename="{safe_filename}"')
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


def action_list(params):
    event_id = params.get("event_id", [""])[0]
    conn = get_db()
    if event_id:
        rows = conn.execute(
            "SELECT * FROM contacts WHERE event_id=? ORDER BY created_at DESC", (event_id,)
        ).fetchall()
    else:
        rows = conn.execute("SELECT * FROM contacts ORDER BY created_at DESC").fetchall()
    conn.close()
    send(200, {"ok": True, "contacts": [row_to_dict(r) for r in rows]})


def action_save():
    payload = read_json_body()
    name = (payload.get("name") or "").strip()
    event_id = (payload.get("event_id") or "").strip()
    if not name:
        send(400, {"ok": False, "error": "name is required"})
        return
    if not event_id:
        send(400, {"ok": False, "error": "event_id is required"})
        return

    conn = get_db()
    contact_id = payload.get("id") or str(uuid.uuid4())
    existing = conn.execute("SELECT id FROM contacts WHERE id=?", (contact_id,)).fetchone()
    created_at = payload.get("created_at") or datetime.now(timezone.utc).isoformat()

    def as_float(value):
        try:
            return float(value) if value not in (None, "") else None
        except (TypeError, ValueError):
            return None

    fields = (
        contact_id,
        event_id,
        name,
        payload.get("company", ""),
        payload.get("position", ""),
        payload.get("phone", ""),
        payload.get("email", ""),
        payload.get("address", ""),
        payload.get("topic", ""),
        payload.get("notes", ""),
        payload.get("priority", "normal"),
        payload.get("photo", ""),
        as_float(payload.get("latitude")),
        as_float(payload.get("longitude")),
        as_float(payload.get("location_accuracy")),
        created_at,
    )

    if existing:
        conn.execute(
            """UPDATE contacts SET event_id=?, name=?, company=?, position=?, phone=?, email=?,
               address=?, topic=?, notes=?, priority=?, photo=?, latitude=?, longitude=?,
               location_accuracy=? WHERE id=?""",
            fields[1:15] + (contact_id,),
        )
    else:
        conn.execute(
            """INSERT INTO contacts
               (id, event_id, name, company, position, phone, email, address, topic, notes,
                priority, photo, latitude, longitude, location_accuracy, created_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            fields,
        )
    conn.commit()
    conn.close()
    log("INFO", f"saved contact {contact_id} ({name}) for event {event_id}")
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


def action_clear_all(params):
    event_id = params.get("event_id", [""])[0]
    conn = get_db()
    if event_id:
        conn.execute("DELETE FROM contacts WHERE event_id=?", (event_id,))
        log("WARN", f"cleared all contacts for event {event_id}")
    else:
        conn.execute("DELETE FROM contacts")
        log("WARN", "cleared all contacts (all events)")
    conn.commit()
    conn.close()
    send(200, {"ok": True})


def fetch_contacts_for_export(params):
    event_id = params.get("event_id", [""])[0]
    conn = get_db()
    if event_id:
        rows = conn.execute(
            "SELECT * FROM contacts WHERE event_id=? ORDER BY created_at DESC", (event_id,)
        ).fetchall()
    else:
        rows = conn.execute("SELECT * FROM contacts ORDER BY created_at DESC").fetchall()
    conn.close()
    return rows


def action_export_csv(params):
    rows = fetch_contacts_for_export(params)
    buf = io.StringIO()
    fieldnames = [
        "name", "company", "position", "phone", "email", "address",
        "topic", "notes", "priority", "latitude", "longitude", "created_at",
    ]
    writer = csv.DictWriter(buf, fieldnames=fieldnames)
    writer.writeheader()
    for r in rows:
        writer.writerow({k: r[k] for k in fieldnames})
    data = buf.getvalue().encode("utf-8-sig")
    filename = params.get("filename", ["leadsnap-kontakte.csv"])[0]
    send_file(200, "text/csv", filename, data)


def vcard_escape(value):
    return (value or "").replace("\\", "\\\\").replace(",", "\\,").replace(";", "\\;").replace("\n", "\\n")


def action_export_vcf(params):
    rows = fetch_contacts_for_export(params)
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
        if r["address"]:
            lines.append(f"ADR;TYPE=WORK:;;{vcard_escape(r['address'])};;;;")
        if r["latitude"] is not None and r["longitude"] is not None:
            lines.append(f"GEO:{r['latitude']};{r['longitude']}")
        if note_text:
            lines.append(f"NOTE:{vcard_escape(note_text)}")
        lines.append("END:VCARD")
    data = ("\n".join(lines) + "\n").encode("utf-8")
    filename = params.get("filename", ["leadsnap-kontakte.vcf"])[0]
    send_file(200, "text/vcard", filename, data)


def main():
    method = os.environ.get("REQUEST_METHOD", "GET")
    query = os.environ.get("QUERY_STRING", "")
    params = parse_qs(query)
    action = params.get("action", ["list" if method == "GET" else ""])[0]

    try:
        if action == "list":
            action_list(params)
        elif action == "save":
            action_save()
        elif action == "delete":
            action_delete()
        elif action == "clear_all":
            action_clear_all(params)
        elif action == "export_csv":
            action_export_csv(params)
        elif action == "export_vcf":
            action_export_vcf(params)
        else:
            send(400, {"ok": False, "error": f"unknown action '{action}'"})
    except Exception as exc:  # noqa: BLE001
        log("ERROR", f"unhandled exception: {exc}")
        send(500, {"ok": False, "error": str(exc)})


if __name__ == "__main__":
    main()

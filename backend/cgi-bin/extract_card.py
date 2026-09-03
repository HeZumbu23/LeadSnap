#!/usr/bin/env python3
"""LeadSnap card extraction API: sends a business-card photo to Claude and
returns structured contact fields as JSON over CGI."""
import os
import sys
import json
import re
import base64
import urllib.request
import urllib.error
from datetime import datetime

APP_NAME = "leadsnap"
ANTHROPIC_VERSION = "2023-06-01"
MODEL = "claude-haiku-4-5-20251001"
API_URL = "https://api.anthropic.com/v1/messages"

EXTRACT_PROMPT = (
    "Das Bild zeigt eine Visitenkarte. Extrahiere die Kontaktdaten und "
    "antworte AUSSCHLIESSLICH mit einem einzigen JSON-Objekt (keine "
    "Erklaerung, kein Markdown, kein Codeblock) mit genau diesen Feldern:\n"
    '{"name": "", "company": "", "position": "", "phone": "", "email": "", "address": ""}\n'
    "Regeln: name = vollstaendiger Personenname. company = Firmenname. "
    "position = Jobtitel/Rolle falls erkennbar. phone = die wichtigste "
    "Telefonnummer (bevorzugt Mobil), so wie gedruckt. email = die "
    "E-Mail-Adresse. address = die vollstaendige Postadresse der Firma "
    "(Strasse, PLZ, Ort), so wie gedruckt, in einer Zeile. Ist ein Feld "
    "nicht erkennbar, gib einen leeren String zurueck. Erfinde keine Daten."
)


def log(level, message):
    # stdout is the CGI response channel - all log levels must go to stderr
    # or they corrupt the HTTP header block and Apache returns a bare 500.
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


def parse_data_url(data_url):
    match = re.match(r"^data:(image/[a-zA-Z+.-]+);base64,(.*)$", data_url, re.DOTALL)
    if not match:
        raise ValueError("photo must be a base64 data URL (data:image/...;base64,...)")
    media_type, b64data = match.group(1), match.group(2)
    base64.b64decode(b64data, validate=True)
    return media_type, b64data


def extract_json_object(text):
    text = text.strip()
    fence = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if fence:
        text = fence.group(1)
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end < start:
        raise ValueError("no JSON object found in model response")
    return json.loads(text[start:end + 1])


def call_claude(media_type, b64data, api_key):
    payload = {
        "model": MODEL,
        "max_tokens": 512,
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": media_type,
                            "data": b64data,
                        },
                    },
                    {"type": "text", "text": EXTRACT_PROMPT},
                ],
            }
        ],
    }
    req = urllib.request.Request(
        API_URL,
        data=json.dumps(payload).encode("utf-8"),
        method="POST",
        headers={
            "x-api-key": api_key,
            "anthropic-version": ANTHROPIC_VERSION,
            "content-type": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=45) as resp:
        return json.loads(resp.read().decode("utf-8"))


def action_extract():
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        log("ERROR", "ANTHROPIC_API_KEY is not configured")
        send(500, {"ok": False, "error": "ANTHROPIC_API_KEY ist nicht konfiguriert."})
        return

    payload = read_json_body()
    photo = payload.get("photo", "")
    if not photo:
        send(400, {"ok": False, "error": "photo is required"})
        return

    try:
        media_type, b64data = parse_data_url(photo)
    except Exception as exc:  # noqa: BLE001
        send(400, {"ok": False, "error": str(exc)})
        return

    try:
        result = call_claude(media_type, b64data, api_key)
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        log("ERROR", f"Claude API HTTP {exc.code}: {detail}")
        send(502, {"ok": False, "error": f"Claude API Fehler ({exc.code})"})
        return
    except Exception as exc:  # noqa: BLE001
        log("ERROR", f"Claude API request failed: {exc}")
        send(502, {"ok": False, "error": "Claude API nicht erreichbar."})
        return

    try:
        text_parts = [b["text"] for b in result.get("content", []) if b.get("type") == "text"]
        raw_text = "\n".join(text_parts)
        fields = extract_json_object(raw_text)
    except Exception as exc:  # noqa: BLE001
        log("ERROR", f"failed to parse model response: {exc}")
        send(502, {"ok": False, "error": "Antwort konnte nicht ausgewertet werden."})
        return

    data = {
        "name": str(fields.get("name") or "").strip(),
        "company": str(fields.get("company") or "").strip(),
        "position": str(fields.get("position") or "").strip(),
        "phone": str(fields.get("phone") or "").strip(),
        "email": str(fields.get("email") or "").strip(),
        "address": str(fields.get("address") or "").strip(),
    }
    log("INFO", f"extracted card data for '{data.get('name') or 'unknown'}'")
    send(200, {"ok": True, "fields": data})


def main():
    method = os.environ.get("REQUEST_METHOD", "GET")
    if method != "POST":
        send(405, {"ok": False, "error": "POST required"})
        return
    try:
        action_extract()
    except Exception as exc:  # noqa: BLE001
        log("ERROR", f"unhandled exception: {exc}")
        send(500, {"ok": False, "error": str(exc)})


if __name__ == "__main__":
    main()

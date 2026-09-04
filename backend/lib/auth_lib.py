"""Shared auth/multi-tenancy helpers for LeadSnap's CGI scripts.

Not a CGI endpoint itself (lives outside cgi-bin/), imported by each
script that needs to know which tenant/user is making the request.
"""
import os
import re
import sqlite3
import hashlib
import hmac
import secrets
from datetime import datetime, timezone, timedelta

COOKIE_NAME = "leadsnap_session"
SESSION_TTL_DAYS = 30
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

# Hardcoded superuser account with cross-tenant read access to platform
# stats (backend/cgi-bin/admin.py). Not a tenant role - this is checked by
# email regardless of which tenant the account belongs to.
ADMIN_EMAILS = {"s1@kerchmail.de"}


def is_admin(email):
    return normalize_email(email) in ADMIN_EMAILS


def data_dir():
    return os.environ.get("APP_DATA_DIR", ".")


def db_path():
    return os.path.join(data_dir(), "leadsnap.db")


def get_db():
    conn = sqlite3.connect(db_path())
    conn.row_factory = sqlite3.Row
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS tenants (
            id TEXT PRIMARY KEY,
            name TEXT,
            created_at TEXT
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            tenant_id TEXT,
            email TEXT UNIQUE,
            password_hash TEXT,
            password_salt TEXT,
            role TEXT,
            created_at TEXT
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS sessions (
            token TEXT PRIMARY KEY,
            user_id TEXT,
            tenant_id TEXT,
            created_at TEXT,
            expires_at TEXT
        )
        """
    )
    return conn


def normalize_email(email):
    return (email or "").strip().lower()


def valid_email(email):
    return bool(EMAIL_RE.match(email or ""))


def hash_password(password, salt=None):
    if salt is None:
        salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 200_000)
    return salt, digest.hex()


def verify_password(password, salt, expected_hash):
    _, computed = hash_password(password, salt)
    return hmac.compare_digest(computed, expected_hash)


def parse_cookies():
    raw = os.environ.get("HTTP_COOKIE", "")
    cookies = {}
    for part in raw.split(";"):
        if "=" in part:
            k, v = part.strip().split("=", 1)
            cookies[k] = v
    return cookies


def is_https():
    return os.environ.get("HTTPS", "").lower() == "on" or os.environ.get("SERVER_PORT") == "443"


def session_cookie_header(token, max_age=SESSION_TTL_DAYS * 86400):
    attrs = f"{COOKIE_NAME}={token}; Path=/; HttpOnly; SameSite=Lax; Max-Age={max_age}"
    if is_https():
        attrs += "; Secure"
    return f"Set-Cookie: {attrs}"


def clear_cookie_header():
    attrs = f"{COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0"
    if is_https():
        attrs += "; Secure"
    return f"Set-Cookie: {attrs}"


def create_session(conn, user_id, tenant_id):
    token = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc)
    expires = now + timedelta(days=SESSION_TTL_DAYS)
    conn.execute(
        "INSERT INTO sessions (token, user_id, tenant_id, created_at, expires_at) VALUES (?,?,?,?,?)",
        (token, user_id, tenant_id, now.isoformat(), expires.isoformat()),
    )
    return token


def current_session():
    """Return {user_id, tenant_id, email} for the request's session cookie, or None."""
    cookies = parse_cookies()
    token = cookies.get(COOKIE_NAME)
    if not token:
        return None
    conn = get_db()
    row = conn.execute(
        """SELECT s.user_id, s.tenant_id, s.expires_at, u.email
           FROM sessions s JOIN users u ON u.id = s.user_id
           WHERE s.token=?""",
        (token,),
    ).fetchone()
    conn.close()
    if not row:
        return None
    expires_at = datetime.fromisoformat(row["expires_at"])
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        return None
    return {"user_id": row["user_id"], "tenant_id": row["tenant_id"], "email": row["email"]}

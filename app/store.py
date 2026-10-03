"""SQLite state: conversation history, webhook de-duplication, handoff queue.

Instagram re-delivers webhooks and can send the same event twice, so every
inbound message id (mid) is stored and checked before we act on it.
"""

from __future__ import annotations

import pathlib
import sqlite3
import time
from contextlib import contextmanager

from . import config

SCHEMA = """
CREATE TABLE IF NOT EXISTS messages (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    thread    TEXT NOT NULL,          -- Instagram-scoped id (IGSID) of the other person
    role      TEXT NOT NULL,          -- 'user' | 'assistant'
    text      TEXT NOT NULL,
    mid       TEXT,
    created   REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread, id);

-- Every inbound webhook id we have already handled.
CREATE TABLE IF NOT EXISTS seen (
    mid     TEXT PRIMARY KEY,
    created REAL NOT NULL
);

-- Threads the bot deliberately did not answer.
CREATE TABLE IF NOT EXISTS handoff (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    thread  TEXT NOT NULL,
    text    TEXT NOT NULL,
    reason  TEXT,
    created REAL NOT NULL,
    done    INTEGER NOT NULL DEFAULT 0
);

-- Who is behind a thread. Instagram sets "user consent" the moment someone
-- messages us, so the profile lookup works for anyone who initiated contact.
CREATE TABLE IF NOT EXISTS people (
    thread   TEXT PRIMARY KEY,
    username TEXT,
    name     TEXT,
    pic      TEXT,
    fetched  REAL NOT NULL
);
"""


def _ensure_parent(path: pathlib.Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


@contextmanager
def connect():
    _ensure_parent(config.DB_PATH)
    conn = sqlite3.connect(str(config.DB_PATH), timeout=15)
    conn.row_factory = sqlite3.Row
    try:
        conn.execute("PRAGMA journal_mode=WAL")
        yield conn
        conn.commit()
    finally:
        conn.close()


def init() -> None:
    with connect() as conn:
        conn.executescript(SCHEMA)


def claim_mid(mid: str | None) -> bool:
    """True if this webhook id is new (and now claimed), False if already seen.

    A None mid (some event types omit it) is always treated as new.
    """
    if not mid:
        return True
    with connect() as conn:
        try:
            conn.execute("INSERT INTO seen(mid, created) VALUES (?, ?)", (mid, time.time()))
            return True
        except sqlite3.IntegrityError:
            return False


def add_message(thread: str, role: str, text: str, mid: str | None = None) -> None:
    with connect() as conn:
        conn.execute(
            "INSERT INTO messages(thread, role, text, mid, created) VALUES (?,?,?,?,?)",
            (thread, role, text, mid, time.time()),
        )


def history(thread: str, turns: int) -> list[dict]:
    """Last `turns` messages of a thread, oldest first, in chat-completion shape."""
    with connect() as conn:
        rows = conn.execute(
            "SELECT role, text FROM messages WHERE thread = ? ORDER BY id DESC LIMIT ?",
            (thread, turns),
        ).fetchall()
    return [{"role": r["role"], "content": r["text"]} for r in reversed(rows)]


def last_inbound_ts(thread: str) -> float:
    with connect() as conn:
        row = conn.execute(
            "SELECT created FROM messages WHERE thread = ? AND role = 'user' ORDER BY id DESC LIMIT 1",
            (thread,),
        ).fetchone()
    return float(row["created"]) if row else 0.0


def within_window(thread: str, hours: float = config.WINDOW_HOURS) -> bool:
    last = last_inbound_ts(thread)
    return bool(last) and (time.time() - last) < hours * 3600


def open_handoffs(limit: int = 50) -> list[dict]:
    with connect() as conn:
        rows = conn.execute(
            "SELECT * FROM handoff WHERE done = 0 ORDER BY id DESC LIMIT ?", (limit,)
        ).fetchall()
    out = []
    for r in rows:
        item = dict(r)
        item["handle"] = handle(r["thread"])
        out.append(item)
    return out


# --- who is this? --------------------------------------------------------- #
def upsert_person(thread: str, username: str = "", name: str = "", pic: str = "") -> None:
    with connect() as conn:
        conn.execute(
            """INSERT INTO people(thread, username, name, pic, fetched) VALUES (?,?,?,?,?)
               ON CONFLICT(thread) DO UPDATE SET
                 username=excluded.username, name=excluded.name,
                 pic=excluded.pic, fetched=excluded.fetched""",
            (thread, username or "", name or "", pic or "", time.time()),
        )


def person(thread: str) -> dict | None:
    with connect() as conn:
        row = conn.execute("SELECT * FROM people WHERE thread = ?", (thread,)).fetchone()
    return dict(row) if row else None


def person_is_fresh(thread: str, days: float = 7.0) -> bool:
    row = person(thread)
    return bool(row) and (time.time() - float(row["fetched"])) < days * 86400


def handle(thread: str) -> str:
    """Readable name for logs and the handoff view: '@username' when known."""
    row = person(thread)
    if row and row.get("username"):
        return f"@{row['username']}"
    if row and row.get("name"):
        return row["name"]
    return thread


def threads(limit: int = 30) -> list[dict]:
    """Recent conversations: who wrote, when, and what the bot answered."""
    with connect() as conn:
        rows = conn.execute(
            """SELECT thread,
                      SUM(role='user')      AS inbound,
                      SUM(role='assistant') AS replies,
                      MAX(created)          AS last_seen
                 FROM messages GROUP BY thread ORDER BY last_seen DESC LIMIT ?""",
            (limit,),
        ).fetchall()
    out = []
    for r in rows:
        row = dict(r)
        row["handle"] = handle(r["thread"])
        with connect() as conn:
            last = conn.execute(
                "SELECT text FROM messages WHERE thread=? ORDER BY id DESC LIMIT 1", (r["thread"],)
            ).fetchone()
        row["last_message"] = (last["text"] if last else "")[:120]
        out.append(row)
    return out


def add_handoff(thread: str, text: str, reason: str = "") -> None:
    with connect() as conn:
        conn.execute(
            "INSERT INTO handoff(thread, text, reason, created) VALUES (?,?,?,?)",
            (thread, text, reason, time.time()),
        )


def stats() -> dict:
    with connect() as conn:
        def one(sql: str) -> int:
            return int(conn.execute(sql).fetchone()[0])

        return {
            "inbound": one("SELECT COUNT(*) FROM messages WHERE role='user'"),
            "sent": one("SELECT COUNT(*) FROM messages WHERE role='assistant'"),
            "webhooks_seen": one("SELECT COUNT(*) FROM seen"),
            "handoffs_open": one("SELECT COUNT(*) FROM handoff WHERE done=0"),
        }

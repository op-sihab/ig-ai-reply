"""Configuration: everything comes from .env so no secret lives in the code.

A value already present in the real environment wins over the .env file, which
is what lets the test harness inject throwaway settings.
"""

from __future__ import annotations

import os
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent


def _load_dotenv(path: pathlib.Path) -> None:
    """Minimal .env reader: KEY=VALUE, '#' comments, optional surrounding quotes."""
    if not path.exists():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        key = key.strip()
        val = val.strip()
        if len(val) >= 2 and val[0] == val[-1] and val[0] in "\"'":
            val = val[1:-1]
        os.environ.setdefault(key, val)


_load_dotenv(ROOT / ".env")


def _str(name: str, default: str = "") -> str:
    return (os.environ.get(name) or default).strip()


def _bool(name: str, default: bool = False) -> bool:
    return _str(name, str(default)).lower() in ("1", "true", "yes", "on")


def _int(name: str, default: int) -> int:
    try:
        return int(_str(name, str(default)))
    except ValueError:
        return default


def _float(name: str, default: float) -> float:
    try:
        return float(_str(name, str(default)))
    except ValueError:
        return default


def _list(name: str) -> list[str]:
    return [w.strip().lower() for w in _str(name).split(",") if w.strip()]


# --- Files -------------------------------------------------------------------
DB_PATH = ROOT / _str("DB_PATH", "data/state.db")
PROMPTS_DIR = ROOT / "prompts"


def _prompt_file(name_key: str, default: str) -> pathlib.Path:
    """Absolute paths are honoured as-is, so one install can run several
    accounts, each with its own persona/knowledge file."""
    raw = pathlib.Path(_str(name_key, default))
    return raw if raw.is_absolute() else PROMPTS_DIR / raw


PERSONA_FILE = _prompt_file("PERSONA_FILE", "persona.md")
KNOWLEDGE_FILE = _prompt_file("KNOWLEDGE_FILE", "knowledge.md")

# --- Safety ------------------------------------------------------------------
# DRY_RUN defaults to True on purpose: a fresh checkout must never be one
# env-var away from DMing real people.
DRY_RUN = _bool("DRY_RUN", True)

# --- Instagram ---------------------------------------------------------------
IG_VERIFY_TOKEN = _str("IG_VERIFY_TOKEN", "change-me")
IG_APP_SECRET = _str("IG_APP_SECRET")
IG_ACCESS_TOKEN = _str("IG_ACCESS_TOKEN")
IG_USER_ID = _str("IG_USER_ID", "me")
IG_HOST = _str("IG_HOST", "https://graph.instagram.com").rstrip("/")
IG_API_VERSION = _str("IG_API_VERSION", "v25.0")

BIND = _str("BIND", "127.0.0.1")
PORT = _int("PORT", 8080)

# --- Behaviour ---------------------------------------------------------------
DEBOUNCE_SECONDS = _float("DEBOUNCE_SECONDS", 3.0)
HISTORY_TURNS = _int("HISTORY_TURNS", 12)
REPLY_MAX_CHARS = _int("REPLY_MAX_CHARS", 900)
IG_TYPING = _bool("IG_TYPING", True)
HANDOFF_KEYWORDS = _list("HANDOFF_KEYWORDS")

# What to do when the MODEL itself decides a human should take over:
#   auto = still send its reply (fully unattended — the default)
#   hold = send nothing and queue the thread for the operator
# HANDOFF_KEYWORDS always hold, whatever this is set to.
HANDOFF_MODE = _str("HANDOFF_MODE", "auto").lower()

# Meta's own rule: a business may reply only within 24h of the user's last
# message. We mirror it locally so we never burn an API call on a dead thread.
WINDOW_HOURS = 24.0

# --- LLM ---------------------------------------------------------------------
LLM_BASE_URL = _str("LLM_BASE_URL", "https://api-gateway.merge.dev/v1").rstrip("/")
LLM_API_KEY = _str("LLM_API_KEY") or _str("HERMES_CUSTOM_MERGE_GATWAY_API_KEY")
LLM_MODEL = _str("LLM_MODEL", "google/gemini-3.7-flash")
LLM_FALLBACK_MODEL = _str("LLM_FALLBACK_MODEL", "deepseek/deepseek-v4.1-flash")
LLM_MAX_TOKENS = _int("LLM_MAX_TOKENS", 900)
LLM_TIMEOUT = _int("LLM_TIMEOUT", 60)

LOG_LEVEL = _str("LOG_LEVEL", "info").lower()

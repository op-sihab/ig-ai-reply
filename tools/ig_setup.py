"""One helper for the Instagram-side chores that the dashboard makes painful.

    python tools/ig_setup.py check        # is everything wired up?
    python tools/ig_setup.py whoami       # which account is this token for?
    python tools/ig_setup.py subscribe    # subscribe the account to your webhook
    python tools/ig_setup.py subscriptions# what is currently subscribed
    python tools/ig_setup.py threads      # last conversations (debugging)
    python tools/ig_setup.py refresh      # exchange for a fresh 60-day token
    python tools/ig_setup.py refresh --write   # ...and save it into .env

Everything reads the same .env as the bot. Stdlib only.
"""

from __future__ import annotations

import argparse
import json
import pathlib
import re
import sys
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from app import config  # noqa: E402

OK, BAD, WARN = "[ok]  ", "[FAIL]", "[warn]"


def api(method: str, path: str, params: dict | None = None) -> dict:
    params = dict(params or {})
    params["access_token"] = config.IG_ACCESS_TOKEN
    query = "&".join(f"{k}={v}" for k, v in params.items())
    url = f"{config.IG_HOST}/{config.IG_API_VERSION}/{path}?{query}"
    req = urllib.request.Request(url, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8") or "{}")
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", "replace")
        try:
            err = json.loads(body).get("error", {})
            raise SystemExit(
                f"{BAD} HTTP {exc.code}: {err.get('message', body)}\n"
                f"       code={err.get('code')} subcode={err.get('error_subcode')}"
            ) from None
        except json.JSONDecodeError:
            raise SystemExit(f"{BAD} HTTP {exc.code}: {body[:300]}") from None


def need_token() -> None:
    if not config.IG_ACCESS_TOKEN:
        raise SystemExit(
            f"{BAD} IG_ACCESS_TOKEN is empty. Put the long-lived token from the Meta app\n"
            "       dashboard (Instagram -> Business login -> Generate token) into .env first."
        )


# --------------------------------------------------------------------------- #
def cmd_check(_args) -> int:
    print("Configuration")
    print(f"  {OK if config.IG_ACCESS_TOKEN else BAD} IG_ACCESS_TOKEN set")
    print(f"  {OK if config.IG_APP_SECRET else BAD} IG_APP_SECRET set"
          f"{'  (webhook signatures are NOT verified)' if not config.IG_APP_SECRET else ''}")
    print(f"  {OK if config.IG_VERIFY_TOKEN != 'change-me' else BAD} IG_VERIFY_TOKEN changed"
          " from the default")
    print(f"  {WARN if config.DRY_RUN else OK} DRY_RUN={config.DRY_RUN}"
          f"{'  (nothing is actually sent)' if config.DRY_RUN else ''}")
    print(f"  {OK} host={config.IG_HOST} api={config.IG_API_VERSION}")
    print(f"  {OK} llm={config.LLM_MODEL} fallback={config.LLM_FALLBACK_MODEL}")
    if config.LLM_MAX_TOKENS < 600:
        print(f"  {WARN} LLM_MAX_TOKENS={config.LLM_MAX_TOKENS} is low — reasoning models"
              " return empty content below ~600")
    else:
        print(f"  {OK} LLM_MAX_TOKENS={config.LLM_MAX_TOKENS}")
    print(f"  {OK if config.LLM_API_KEY else BAD} LLM API key resolved")

    print("\nPrompt files")
    for label, path in (("persona", config.PERSONA_FILE), ("knowledge", config.KNOWLEDGE_FILE)):
        text = path.read_text(encoding="utf-8") if path.exists() else ""
        placeholders = len(re.findall(r"<[^>\n]{1,60}>", text))
        if not text.strip():
            print(f"  {BAD} {label}: {path} is empty")
        elif placeholders:
            print(f"  {WARN} {label}: {path} still has {placeholders} <placeholder> spot(s)")
        else:
            print(f"  {OK} {label}: {path}")

    print("\nInstagram")
    need_token()
    try:
        me = api("GET", "me", {"fields": "id,username,account_type"})
        print(f"  {OK} token belongs to @{me.get('username')} (id {me.get('id')},"
              f" type {me.get('account_type')})")
    except SystemExit as exc:
        print(f"  {BAD} token unusable: {exc}")
        return 1
    subs = api("GET", "me/subscribed_apps")
    data = subs.get("data") or []
    fields = [f for app in data for f in (app.get("subscribed_fields") or [])]
    if "messages" in fields:
        print(f"  {OK} account is subscribed to: {', '.join(sorted(set(fields)))}")
    else:
        print(f"  {BAD} the 'messages' field is NOT subscribed — run:"
              "  python tools/ig_setup.py subscribe")
    print("\nStill to check by hand in the Instagram app:")
    print("  - Settings and privacy -> Account type and tools -> professional account")
    print("  - Messages and story replies -> Message requests -> Connected tools")
    print("    -> 'Allow access to messages' is ON")
    return 0


def cmd_whoami(_args) -> int:
    need_token()
    print(json.dumps(api("GET", "me", {"fields": "id,username,account_type"}), indent=2))
    return 0


def cmd_subscribe(args) -> int:
    need_token()
    fields = args.fields or "messages,messaging_postbacks,message_reactions,messaging_seen"
    out = api("POST", "me/subscribed_apps", {"subscribed_fields": fields})
    print(f"{OK} subscribe requested for: {out.get('success')}")
    print(json.dumps(api("GET", "me/subscribed_apps"), indent=2))
    return 0


def cmd_subscriptions(_args) -> int:
    need_token()
    print(json.dumps(api("GET", "me/subscribed_apps"), indent=2))
    return 0


def cmd_threads(args) -> int:
    need_token()
    out = api(
        "GET",
        "me/conversations",
        {"platform": "instagram", "fields": "id,updated_time,participants", "limit": args.limit},
    )
    for convo in out.get("data") or []:
        people = ", ".join(
            p.get("username") or p.get("id") for p in (convo.get("participants") or {}).get("data", [])
        )
        print(f"  {convo.get('id')}  {convo.get('updated_time')}  {people}")
    if not out.get("data"):
        print("  (no conversations returned)")
    return 0


def cmd_refresh(args) -> int:
    """Long-lived tokens expire after 60 days; refresh before then.

    Meta rejects a refresh on a token younger than 24 hours.
    """
    need_token()
    out = api("GET", "refresh_access_token",
              {"grant_type": "ig_refresh_token"})
    token = out.get("access_token")
    if not token:
        print(f"{BAD} no access_token in the response: {json.dumps(out)[:200]}")
        return 1
    days = int(out.get("expires_in", 0)) // 86400
    print(f"{OK} new token received, valid ~{days} days")
    if args.write:
        env = ROOT / ".env"
        if not env.exists():
            print(f"{BAD} .env not found — copy .env.example first")
            return 1
        text = env.read_text(encoding="utf-8")
        if re.search(r"^IG_ACCESS_TOKEN=.*$", text, flags=re.M):
            text = re.sub(r"^IG_ACCESS_TOKEN=.*$", f"IG_ACCESS_TOKEN={token}", text, flags=re.M)
        else:
            text += f"\nIG_ACCESS_TOKEN={token}\n"
        env.write_text(text, encoding="utf-8")
        print(f"{OK} written to {env} — restart run.py to pick it up")
    else:
        print(f"     (dry run — add --write to save it into .env)\n     {token[:24]}…")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="cmd", required=True)

    sub.add_parser("check", help="verify config, prompts, token and subscription")
    sub.add_parser("whoami", help="show which Instagram account the token belongs to")
    sp = sub.add_parser("subscribe", help="subscribe the account to your webhook")
    sp.add_argument("--fields", default=None, help="comma-separated webhook fields")
    sub.add_parser("subscriptions", help="show current subscriptions")
    tp = sub.add_parser("threads", help="list recent conversations")
    tp.add_argument("--limit", type=int, default=10)
    rp = sub.add_parser("refresh", help="exchange for a fresh 60-day token")
    rp.add_argument("--write", action="store_true", help="save the new token into .env")

    args = parser.parse_args()
    return {
        "check": cmd_check,
        "whoami": cmd_whoami,
        "subscribe": cmd_subscribe,
        "subscriptions": cmd_subscriptions,
        "threads": cmd_threads,
        "refresh": cmd_refresh,
    }[args.cmd](args)


if __name__ == "__main__":
    raise SystemExit(main())

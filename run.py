"""Entrypoint: python run.py

Serves the webhook. Put it behind HTTPS (a tunnel for local dev, a VPS or
container in production) — Meta will not call a plain http:// address.
"""

from __future__ import annotations

import uvicorn

from app import config


def main() -> None:
    print("=" * 68)
    print(" Instagram AI auto-reply")
    print(f"   listening : http://{config.BIND}:{config.PORT}")
    print(f"   webhook   : POST /webhook   handshake: GET /webhook")
    print(f"   health    : GET  /health    handoffs:  GET /handoffs")
    print(f"   dry run   : {config.DRY_RUN}   model: {config.LLM_MODEL}")
    print("=" * 68)
    uvicorn.run(
        "app.webhook:app",
        host=config.BIND,
        port=config.PORT,
        log_level=config.LOG_LEVEL,
    )


if __name__ == "__main__":
    main()

"""开发/生产启动入口：python backend/run.py

等价于：uvicorn app.main:app --host 127.0.0.1 --port 8000
"""

from __future__ import annotations

import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import uvicorn  # noqa: E402

from app.config import settings  # noqa: E402
from app.main import app  # noqa: E402


def main() -> None:
    print("=" * 62)
    print(f"  {settings.APP_TITLE}")
    print(f"  站点首页   http://{settings.APP_HOST}:{settings.APP_PORT}/")
    print(f"  接口文档   http://{settings.APP_HOST}:{settings.APP_PORT}/docs")
    print(f"  MySQL      {settings.DB_USER}@{settings.DB_HOST}:{settings.DB_PORT}/{settings.DB_NAME}")
    print("=" * 62)
    uvicorn.run(
        app,
        host=settings.APP_HOST,
        port=settings.APP_PORT,
        log_level="info",
        access_log=True,
    )


if __name__ == "__main__":
    main()

"""配置：从项目根目录的 .env 读取，环境变量优先。"""

from __future__ import annotations

import os
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]


def _load_dotenv(path: Path) -> None:
    """极简 .env 解析（不覆盖已存在的真实环境变量）。"""
    if not path.is_file():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key:
            os.environ.setdefault(key, value)


_load_dotenv(PROJECT_ROOT / ".env")


def _int_env(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except (TypeError, ValueError):
        return default


class Settings:
    """集中配置对象。"""

    PROJECT_ROOT: Path = PROJECT_ROOT
    BACKEND_DIR: Path = PROJECT_ROOT / "backend"
    FRONTEND_DIR: Path = PROJECT_ROOT / "frontend"
    DATA_DIR: Path = PROJECT_ROOT / "data"
    UPLOAD_DIR: Path = PROJECT_ROOT / "data" / "uploads"
    SQL_DIR: Path = PROJECT_ROOT / "backend" / "sql"

    DB_HOST: str = os.environ.get("DB_HOST", "127.0.0.1")
    DB_PORT: int = _int_env("DB_PORT", 3306)
    DB_USER: str = os.environ.get("DB_USER", "root")
    DB_PASSWORD: str = os.environ.get("DB_PASSWORD", "")
    DB_NAME: str = os.environ.get("DB_NAME", "campus_market")
    DB_POOL_SIZE: int = _int_env("DB_POOL_SIZE", 10)
    DB_CONNECT_TIMEOUT: int = _int_env("DB_CONNECT_TIMEOUT", 8)

    APP_HOST: str = os.environ.get("APP_HOST", "127.0.0.1")
    APP_PORT: int = _int_env("APP_PORT", 8000)
    APP_TITLE: str = os.environ.get("APP_TITLE", "校园二手交易平台")

    SECRET_KEY: str = os.environ.get("SECRET_KEY", "campus-market-dev-secret-change-me")
    TOKEN_EXPIRE_HOURS: int = _int_env("TOKEN_EXPIRE_HOURS", 168)
    MAX_UPLOAD_MB: int = _int_env("MAX_UPLOAD_MB", 8)

    @property
    def TOKEN_EXPIRE_SECONDS(self) -> int:
        return self.TOKEN_EXPIRE_HOURS * 3600

    @property
    def db_kwargs(self) -> dict:
        """PyMySQL 连接参数。"""
        return {
            "host": self.DB_HOST,
            "port": self.DB_PORT,
            "user": self.DB_USER,
            "password": self.DB_PASSWORD,
            "database": self.DB_NAME,
            "connect_timeout": self.DB_CONNECT_TIMEOUT,
        }

    def ensure_dirs(self) -> None:
        self.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


settings = Settings()

"""口令散列与自签令牌（只依赖标准库，无需 PyJWT / passlib）。

- 口令：PBKDF2-HMAC-SHA256，20 万轮，每用户独立随机盐
- 令牌：`base64url(payload).base64url(HMAC-SHA256)`，载荷含 uid/role/exp
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import time
from typing import Any, Optional

from .config import settings

_PBKDF2_ITERATIONS = 200_000
_ALGO = "pbkdf2_sha256"


# --- base64url helpers ----------------------------------------------------

def _b64e(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _b64d(text: str) -> bytes:
    pad = "=" * (-len(text) % 4)
    return base64.urlsafe_b64decode(text + pad)


# --- 口令 -----------------------------------------------------------------

def hash_password(password: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, _PBKDF2_ITERATIONS)
    return f"{_ALGO}${_PBKDF2_ITERATIONS}${_b64e(salt)}${_b64e(digest)}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, iterations, salt_b64, digest_b64 = stored.split("$")
        if algo != _ALGO:
            return False
        expected = _b64d(digest_b64)
        actual = hashlib.pbkdf2_hmac(
            "sha256", password.encode("utf-8"), _b64d(salt_b64), int(iterations)
        )
        return hmac.compare_digest(actual, expected)
    except Exception:
        return False


# --- 令牌 -----------------------------------------------------------------

def _sign(message: bytes) -> bytes:
    return hmac.new(settings.SECRET_KEY.encode("utf-8"), message, hashlib.sha256).digest()


def create_token(user_id: int, role: str, expires_in: Optional[int] = None) -> str:
    payload = {
        "uid": int(user_id),
        "role": role,
        "iat": int(time.time()),
        "exp": int(time.time()) + int(expires_in or settings.TOKEN_EXPIRE_SECONDS),
    }
    body = _b64e(json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8"))
    signature = _b64e(_sign(body.encode("ascii")))
    return f"{body}.{signature}"


def decode_token(token: str) -> Optional[dict[str, Any]]:
    if not token or token.count(".") != 1:
        return None
    try:
        body, signature = token.split(".")
        if not hmac.compare_digest(_sign(body.encode("ascii")), _b64d(signature)):
            return None
        payload = json.loads(_b64d(body).decode("utf-8"))
        if int(payload.get("exp", 0)) < int(time.time()):
            return None
        return payload
    except Exception:
        return None

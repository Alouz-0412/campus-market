"""FastAPI 依赖：当前用户 / 可选用户 / 管理员。"""

from __future__ import annotations

from typing import Optional

from fastapi import Depends, Header, HTTPException, Request

from . import db

USER_COLUMNS = (
    "id, username, nickname, email, phone, avatar, campus, bio, "
    "role, status, rating_sum, rating_count, created_at"
)


def public_user(row: Optional[dict]) -> Optional[dict]:
    """去掉敏感字段，补上平均分。"""
    if not row:
        return None
    user = dict(row)
    user.pop("password_hash", None)
    count = int(user.get("rating_count") or 0)
    total = int(user.get("rating_sum") or 0)
    user["rating_avg"] = round(total / count, 2) if count else None
    return user


def _token_from_request(request: Request, authorization: Optional[str]) -> Optional[str]:
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization[7:].strip()
        if token:
            return token
    return request.cookies.get("cm_token")


def get_optional_user(
    request: Request,
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
) -> Optional[dict]:
    from .security import decode_token

    token = _token_from_request(request, authorization)
    if not token:
        return None
    payload = decode_token(token)
    if not payload:
        return None
    user = db.query_one(f"SELECT {USER_COLUMNS} FROM users WHERE id = %s", (payload.get("uid"),))
    if not user or int(user.get("status") or 0) != 1:
        return None
    return public_user(user)


def get_current_user(user: Optional[dict] = Depends(get_optional_user)) -> dict:
    if not user:
        raise HTTPException(status_code=401, detail="请先登录")
    return user


def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="需要管理员权限")
    return user

"""认证：注册 / 登录 / 登出 / 当前用户 / 资料与密码。"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response

from .. import db
from ..config import settings
from ..deps import USER_COLUMNS, get_current_user, public_user
from ..schemas import LoginIn, PasswordIn, ProfileIn, RegisterIn
from ..security import create_token, hash_password, verify_password

router = APIRouter(prefix="/api/auth", tags=["认证"])


def _set_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        "cm_token",
        token,
        max_age=settings.TOKEN_EXPIRE_SECONDS,
        httponly=True,
        samesite="lax",
        path="/",
    )


def _issue(user: dict) -> dict:
    return {
        "token": create_token(int(user["id"]), user["role"]),
        "user": public_user(user),
    }


@router.post("/register", summary="注册")
def register(payload: RegisterIn, response: Response):
    if db.query_one("SELECT id FROM users WHERE username = %s", (payload.username,)):
        raise HTTPException(status_code=400, detail="该用户名已被占用")
    if payload.email and db.query_one("SELECT id FROM users WHERE email = %s", (payload.email,)):
        raise HTTPException(status_code=400, detail="该邮箱已被注册")

    nickname = (payload.nickname or "").strip() or payload.username
    uid = db.insert(
        """INSERT INTO users (username, password_hash, nickname, email, phone, campus)
           VALUES (%s, %s, %s, %s, %s, %s)""",
        (
            payload.username,
            hash_password(payload.password),
            nickname,
            payload.email,
            payload.phone,
            (payload.campus or "").strip() or None,
        ),
    )
    user = db.query_one(f"SELECT {USER_COLUMNS} FROM users WHERE id = %s", (uid,))
    result = _issue(user)
    _set_cookie(response, result["token"])
    return result


@router.post("/login", summary="登录")
def login(payload: LoginIn, response: Response):
    account = payload.username.strip()
    row = db.query_one(
        f"SELECT {USER_COLUMNS}, password_hash FROM users WHERE username = %s OR email = %s",
        (account, account),
    )
    if not row or not verify_password(payload.password, row["password_hash"]):
        raise HTTPException(status_code=400, detail="用户名或密码错误")
    if int(row.get("status") or 0) != 1:
        raise HTTPException(status_code=403, detail="该账号已被禁用，请联系管理员")
    result = _issue(row)
    _set_cookie(response, result["token"])
    return result


@router.post("/logout", summary="登出")
def logout(response: Response):
    response.delete_cookie("cm_token", path="/")
    return {"ok": True}


@router.get("/me", summary="当前登录用户")
def me(user: dict = Depends(get_current_user)):
    return user


@router.put("/me", summary="修改资料")
def update_profile(payload: ProfileIn, user: dict = Depends(get_current_user)):
    fields: list[str] = []
    args: list = []

    if payload.email is not None:
        email = payload.email.strip() or None
        if email and db.query_one(
            "SELECT id FROM users WHERE email = %s AND id <> %s", (email, user["id"])
        ):
            raise HTTPException(status_code=400, detail="该邮箱已被其他账号使用")
        fields.append("email = %s")
        args.append(email)

    for column, value in (
        ("nickname", payload.nickname),
        ("campus", payload.campus),
        ("phone", payload.phone),
        ("bio", payload.bio),
        ("avatar", payload.avatar),
    ):
        if value is not None:
            fields.append(f"{column} = %s")
            args.append(value.strip() or None)

    if not fields:
        return user

    args.append(user["id"])
    db.execute(f"UPDATE users SET {', '.join(fields)} WHERE id = %s", args)
    fresh = db.query_one(f"SELECT {USER_COLUMNS} FROM users WHERE id = %s", (user["id"],))
    return public_user(fresh)


@router.put("/me/password", summary="修改密码")
def change_password(payload: PasswordIn, user: dict = Depends(get_current_user)):
    row = db.query_one("SELECT password_hash FROM users WHERE id = %s", (user["id"],))
    if not row or not verify_password(payload.old_password, row["password_hash"]):
        raise HTTPException(status_code=400, detail="原密码不正确")
    db.execute(
        "UPDATE users SET password_hash = %s WHERE id = %s",
        (hash_password(payload.new_password), user["id"]),
    )
    return {"ok": True, "message": "密码已更新"}

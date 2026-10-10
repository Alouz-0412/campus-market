"""请求体校验模型（Pydantic v2）。"""

from __future__ import annotations

import re
from typing import List, Optional

from pydantic import BaseModel, Field, field_validator

USERNAME_RE = re.compile(r"^[A-Za-z0-9_]{3,32}$")
PHONE_RE = re.compile(r"^[0-9+\-\s]{6,20}$")


class RegisterIn(BaseModel):
    username: str = Field(..., min_length=3, max_length=32)
    password: str = Field(..., min_length=6, max_length=64)
    nickname: Optional[str] = Field(default=None, max_length=32)
    campus: Optional[str] = Field(default=None, max_length=64)
    email: Optional[str] = Field(default=None, max_length=128)
    phone: Optional[str] = Field(default=None, max_length=20)

    @field_validator("username")
    @classmethod
    def _check_username(cls, v: str) -> str:
        v = (v or "").strip()
        if not USERNAME_RE.match(v):
            raise ValueError("用户名只能是 3-32 位字母、数字或下划线")
        return v

    @field_validator("email")
    @classmethod
    def _check_email(cls, v: Optional[str]) -> Optional[str]:
        if v in (None, ""):
            return None
        v = v.strip()
        if "@" not in v or "." not in v.split("@")[-1]:
            raise ValueError("邮箱格式不正确")
        return v

    @field_validator("phone")
    @classmethod
    def _check_phone(cls, v: Optional[str]) -> Optional[str]:
        if v in (None, ""):
            return None
        v = v.strip()
        if not PHONE_RE.match(v):
            raise ValueError("手机号格式不正确")
        return v


class LoginIn(BaseModel):
    username: str = Field(..., min_length=1, max_length=32)
    password: str = Field(..., min_length=1, max_length=64)


class ProfileIn(BaseModel):
    nickname: Optional[str] = Field(default=None, max_length=32)
    campus: Optional[str] = Field(default=None, max_length=64)
    phone: Optional[str] = Field(default=None, max_length=20)
    email: Optional[str] = Field(default=None, max_length=128)
    bio: Optional[str] = Field(default=None, max_length=255)
    avatar: Optional[str] = Field(default=None, max_length=255)


class PasswordIn(BaseModel):
    old_password: str = Field(..., min_length=1, max_length=64)
    new_password: str = Field(..., min_length=6, max_length=64)


class ProductIn(BaseModel):
    title: str = Field(..., min_length=2, max_length=120)
    description: Optional[str] = Field(default=None, max_length=5000)
    price: float = Field(..., ge=0, le=9_999_999)
    original_price: Optional[float] = Field(default=None, ge=0, le=9_999_999)
    category_id: int = Field(..., ge=1)
    condition_level: int = Field(default=2, ge=1, le=4)
    trade_place: Optional[str] = Field(default=None, max_length=64)
    # 与前端规则一致：至少一张图，第一张作为封面（拖拽排序后按数组顺序落库）
    images: List[str] = Field(..., max_length=9, min_length=1)


class ProductStatusIn(BaseModel):
    status: str = Field(..., pattern="^(on_sale|reserved|sold|off_shelf)$")


class OrderIn(BaseModel):
    product_id: int = Field(..., ge=1)
    trade_place: Optional[str] = Field(default=None, max_length=64)
    trade_time: Optional[str] = Field(default=None, max_length=64)
    remark: Optional[str] = Field(default=None, max_length=255)


class OrderActionIn(BaseModel):
    action: str = Field(..., pattern="^(accept|complete|cancel)$")
    reason: Optional[str] = Field(default=None, max_length=255)


class MessageIn(BaseModel):
    to_user_id: int = Field(..., ge=1)
    product_id: Optional[int] = Field(default=None, ge=1)
    content: str = Field(..., min_length=1, max_length=1000)


class ReviewIn(BaseModel):
    rating: int = Field(default=5, ge=1, le=5)
    content: Optional[str] = Field(default=None, max_length=500)


class UserStatusIn(BaseModel):
    status: int = Field(..., ge=0, le=1)

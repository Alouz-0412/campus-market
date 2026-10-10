"""公开的用户主页与评价列表。"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query

from .. import db
from ..deps import USER_COLUMNS, get_optional_user, public_user
from ..utils import decorate_order, decorate_product, page_params
from .catalog import _LIST_SELECT  # 复用商品列表查询

router = APIRouter(prefix="/api/users", tags=["用户"])


@router.get("/{user_id}", summary="用户公开主页")
def get_user(user_id: int, viewer: dict | None = Depends(get_optional_user)):
    row = db.query_one(f"SELECT {USER_COLUMNS} FROM users WHERE id = %s", (user_id,))
    if not row or int(row.get("status") or 0) != 1:
        raise HTTPException(status_code=404, detail="用户不存在")
    profile = public_user(row)
    profile["stats"] = {
        "on_sale": int(
            db.query_scalar(
                """SELECT COUNT(*) FROM products
                   WHERE seller_id = %s AND is_deleted = 0 AND status IN ('on_sale','reserved')""",
                (user_id,),
                default=0,
            )
        ),
        "sold": int(
            db.query_scalar(
                """SELECT COUNT(*) FROM products
                   WHERE seller_id = %s AND is_deleted = 0 AND status = 'sold'""",
                (user_id,),
                default=0,
            )
        ),
        "reviews": int(
            db.query_scalar(
                "SELECT COUNT(*) FROM reviews WHERE to_user_id = %s", (user_id,), default=0
            )
        ),
    }
    return profile


@router.get("/{user_id}/products", summary="该用户的在售商品")
def user_products(
    user_id: int,
    page: int = Query(default=1, ge=1),
    size: int = Query(default=12, ge=1, le=60),
    viewer: dict | None = Depends(get_optional_user),
):
    offset, limit = page_params(page, size)
    viewer_id = int(viewer["id"]) if viewer else 0
    total = int(
        db.query_scalar(
            """SELECT COUNT(*) FROM products p JOIN users u ON u.id = p.seller_id
               WHERE p.seller_id = %s AND p.is_deleted = 0 AND u.status = 1
                 AND p.status IN ('on_sale','reserved')""",
            (user_id,),
            default=0,
        )
    )
    rows = db.query_all(
        f"""{_LIST_SELECT}
        WHERE p.seller_id = %s AND p.is_deleted = 0 AND u.status = 1
          AND p.status IN ('on_sale','reserved')
        ORDER BY p.created_at DESC
        LIMIT %s OFFSET %s""",
        (viewer_id, user_id, limit, offset),
    )
    return {
        "items": [decorate_product(r) for r in rows],
        "total": total,
        "page": page,
        "size": limit,
        "pages": (total + limit - 1) // limit if limit else 0,
    }


@router.get("/{user_id}/reviews", summary="该用户收到的评价")
def user_reviews(
    user_id: int,
    page: int = Query(default=1, ge=1),
    size: int = Query(default=10, ge=1, le=50),
):
    offset, limit = page_params(page, size)
    total = int(
        db.query_scalar("SELECT COUNT(*) FROM reviews WHERE to_user_id = %s", (user_id,), default=0)
    )
    rows = db.query_all(
        """SELECT r.id, r.rating, r.content, r.created_at,
                  r.from_user_id, u.nickname AS from_nickname, u.avatar AS from_avatar,
                  r.product_id, p.title AS product_title,
                  o.order_no
           FROM reviews r
           JOIN users u ON u.id = r.from_user_id
           LEFT JOIN products p ON p.id = r.product_id
           LEFT JOIN orders o ON o.id = r.order_id
           WHERE r.to_user_id = %s
           ORDER BY r.created_at DESC
           LIMIT %s OFFSET %s""",
        (user_id, limit, offset),
    )
    return {
        "items": rows,
        "total": total,
        "page": page,
        "size": limit,
        "pages": (total + limit - 1) // limit if limit else 0,
    }

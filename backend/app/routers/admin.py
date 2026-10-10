"""管理后台：统计概览、用户管理、商品管理、订单总览。"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from .. import db
from ..deps import require_admin
from ..schemas import UserStatusIn
from ..utils import decorate_order, decorate_product, escape_like, page_params

router = APIRouter(prefix="/api/admin", tags=["管理后台"])


@router.get("/stats", summary="平台概览")
def stats(admin: dict = Depends(require_admin)):
    overview = {
        "users": int(db.query_scalar("SELECT COUNT(*) FROM users", default=0)),
        "users_today": int(
            db.query_scalar(
                "SELECT COUNT(*) FROM users WHERE DATE(created_at) = CURDATE()", default=0
            )
        ),
        "products": int(
            db.query_scalar("SELECT COUNT(*) FROM products WHERE is_deleted = 0", default=0)
        ),
        "products_on_sale": int(
            db.query_scalar(
                "SELECT COUNT(*) FROM products WHERE is_deleted = 0 AND status IN ('on_sale','reserved')",
                default=0,
            )
        ),
        "products_sold": int(
            db.query_scalar(
                "SELECT COUNT(*) FROM products WHERE is_deleted = 0 AND status = 'sold'", default=0
            )
        ),
        "orders": int(db.query_scalar("SELECT COUNT(*) FROM orders", default=0)),
        "orders_pending": int(
            db.query_scalar("SELECT COUNT(*) FROM orders WHERE status = 'pending'", default=0)
        ),
        "orders_completed": int(
            db.query_scalar("SELECT COUNT(*) FROM orders WHERE status = 'completed'", default=0)
        ),
        "gmv": float(
            db.query_scalar(
                "SELECT COALESCE(SUM(amount), 0) FROM orders WHERE status = 'completed'",
                default=0,
            )
        ),
        "messages": int(db.query_scalar("SELECT COUNT(*) FROM messages", default=0)),
        "reviews": int(db.query_scalar("SELECT COUNT(*) FROM reviews", default=0)),
    }

    trend = db.query_all(
        """SELECT d.day,
                  (SELECT COUNT(*) FROM users u WHERE DATE(u.created_at) = d.day) AS new_users,
                  (SELECT COUNT(*) FROM products p WHERE DATE(p.created_at) = d.day AND p.is_deleted = 0) AS new_products,
                  (SELECT COUNT(*) FROM orders o WHERE DATE(o.created_at) = d.day) AS new_orders
           FROM (
                SELECT CURDATE() - INTERVAL n DAY AS day
                FROM (SELECT 0 AS n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3
                      UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6) seq
           ) d
           ORDER BY d.day ASC"""
    )

    category_rank = db.query_all(
        """SELECT c.name, c.icon,
                  (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.is_deleted = 0) AS cnt
           FROM categories c
           ORDER BY cnt DESC, c.sort ASC
           LIMIT 10"""
    )

    top_sellers = db.query_all(
        """SELECT u.id, u.nickname, u.campus, u.avatar, u.rating_sum, u.rating_count,
                  (SELECT COUNT(*) FROM orders o WHERE o.seller_id = u.id AND o.status = 'completed') AS sold_orders
           FROM users u
           WHERE u.role = 'user'
           ORDER BY sold_orders DESC, u.id ASC
           LIMIT 8"""
    )

    recent_orders = db.query_all(
        """SELECT o.id, o.order_no, o.title_snapshot, o.amount, o.status, o.created_at,
                  b.nickname AS buyer_nickname, s.nickname AS seller_nickname
           FROM orders o
           JOIN users b ON b.id = o.buyer_id
           JOIN users s ON s.id = o.seller_id
           ORDER BY o.created_at DESC, o.id DESC
           LIMIT 8"""
    )

    return {
        "overview": overview,
        "trend": trend,
        "category_rank": category_rank,
        "top_sellers": top_sellers,
        "recent_orders": [decorate_order(r) for r in recent_orders],
    }


@router.get("/users", summary="用户列表")
def list_users(
    keyword: Optional[str] = None,
    status: Optional[int] = Query(default=None, ge=0, le=1),
    page: int = Query(default=1, ge=1),
    size: int = Query(default=15, ge=1, le=60),
    admin: dict = Depends(require_admin),
):
    where = ["1 = 1"]
    args: list = []
    if keyword:
        kw = f"%{escape_like(keyword.strip())}%"
        where.append(
            "(u.username LIKE %s ESCAPE '\\\\' OR u.nickname LIKE %s ESCAPE '\\\\' OR u.campus LIKE %s ESCAPE '\\\\')"
        )
        args.extend([kw, kw, kw])
    if status is not None:
        where.append("u.status = %s")
        args.append(status)
    where_sql = " AND ".join(where)

    total = int(db.query_scalar(f"SELECT COUNT(*) FROM users u WHERE {where_sql}", args, default=0))
    offset, limit = page_params(page, size)
    rows = db.query_all(
        f"""SELECT u.id, u.username, u.nickname, u.email, u.phone, u.campus, u.avatar,
                   u.role, u.status, u.rating_sum, u.rating_count, u.created_at,
                   (SELECT COUNT(*) FROM products p WHERE p.seller_id = u.id AND p.is_deleted = 0) AS product_count,
                   (SELECT COUNT(*) FROM orders o WHERE o.buyer_id = u.id) AS buy_count,
                   (SELECT COUNT(*) FROM orders o WHERE o.seller_id = u.id) AS sell_count
            FROM users u
            WHERE {where_sql}
            ORDER BY u.id DESC
            LIMIT %s OFFSET %s""",
        args + [limit, offset],
    )
    for row in rows:
        count = int(row.get("rating_count") or 0)
        row["rating_avg"] = round(int(row.get("rating_sum") or 0) / count, 2) if count else None
    return {
        "items": rows,
        "total": total,
        "page": page,
        "size": limit,
        "pages": (total + limit - 1) // limit if limit else 0,
    }


@router.post("/users/{user_id}/status", summary="启用/禁用用户")
def set_user_status(user_id: int, payload: UserStatusIn, admin: dict = Depends(require_admin)):
    if int(user_id) == int(admin["id"]):
        raise HTTPException(status_code=400, detail="不能禁用自己")
    row = db.query_one("SELECT id, role FROM users WHERE id = %s", (user_id,))
    if not row:
        raise HTTPException(status_code=404, detail="用户不存在")
    if row["role"] == "admin":
        raise HTTPException(status_code=400, detail="不能禁用管理员账号")
    db.execute("UPDATE users SET status = %s WHERE id = %s", (payload.status, user_id))
    return {"ok": True, "status": payload.status, "message": "已更新"}


@router.get("/products", summary="商品列表")
def list_products(
    keyword: Optional[str] = None,
    status: Optional[str] = Query(
        default=None, pattern="^(on_sale|reserved|sold|off_shelf)$"
    ),
    page: int = Query(default=1, ge=1),
    size: int = Query(default=15, ge=1, le=60),
    admin: dict = Depends(require_admin),
):
    where = ["p.is_deleted = 0"]
    args: list = [0]
    if keyword:
        kw = f"%{escape_like(keyword.strip())}%"
        where.append("(p.title LIKE %s ESCAPE '\\\\' OR p.description LIKE %s ESCAPE '\\\\')")
        args.extend([kw, kw])
    if status:
        where.append("p.status = %s")
        args.append(status)
    where_sql = " AND ".join(where)

    total = int(
        # args[0] 是 _LIST_SELECT 的 favorites 占位符，COUNT 不需要
        db.query_scalar(
            f"SELECT COUNT(*) FROM products p WHERE {where_sql}", args[1:], default=0
        )
    )
    from .catalog import _LIST_SELECT

    offset, limit = page_params(page, size)
    rows = db.query_all(
        f"""{_LIST_SELECT}
        WHERE {where_sql}
        ORDER BY p.id DESC
        LIMIT %s OFFSET %s""",
        args + [limit, offset],
    )
    return {
        "items": [decorate_product(r) for r in rows],
        "total": total,
        "page": page,
        "size": limit,
        "pages": (total + limit - 1) // limit if limit else 0,
    }


@router.delete("/products/{product_id}", summary="强制下架商品")
def remove_product(product_id: int, admin: dict = Depends(require_admin)):
    if not db.query_one("SELECT id FROM products WHERE id = %s", (product_id,)):
        raise HTTPException(status_code=404, detail="商品不存在")
    db.execute(
        "UPDATE products SET is_deleted = 1, status = 'off_shelf' WHERE id = %s", (product_id,)
    )
    return {"ok": True, "message": "已下架并删除"}


@router.get("/orders", summary="订单总览")
def list_orders(
    status: Optional[str] = Query(
        default=None, pattern="^(pending|accepted|completed|cancelled)$"
    ),
    keyword: Optional[str] = None,
    page: int = Query(default=1, ge=1),
    size: int = Query(default=15, ge=1, le=60),
    admin: dict = Depends(require_admin),
):
    where = ["1 = 1"]
    args: list = []
    if status:
        where.append("o.status = %s")
        args.append(status)
    if keyword:
        kw = f"%{escape_like(keyword.strip())}%"
        where.append("(o.order_no LIKE %s ESCAPE '\\\\' OR o.title_snapshot LIKE %s ESCAPE '\\\\')")
        args.extend([kw, kw])
    where_sql = " AND ".join(where)

    total = int(
        db.query_scalar(f"SELECT COUNT(*) FROM orders o WHERE {where_sql}", args, default=0)
    )
    offset, limit = page_params(page, size)
    rows = db.query_all(
        """SELECT o.*, b.nickname AS buyer_nickname, s.nickname AS seller_nickname,
                  (SELECT COUNT(*) FROM reviews r WHERE r.order_id = o.id) AS review_count,
                  0 AS reviewed_by_me
           FROM orders o
           JOIN users b ON b.id = o.buyer_id
           JOIN users s ON s.id = o.seller_id
           WHERE {where_sql}
           ORDER BY o.id DESC
           LIMIT %s OFFSET %s""".format(where_sql=where_sql),
        args + [limit, offset],
    )
    return {
        "items": [decorate_order(r) for r in rows],
        "total": total,
        "page": page,
        "size": limit,
        "pages": (total + limit - 1) // limit if limit else 0,
    }

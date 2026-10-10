"""订单：下单 -> 卖家接单 -> 面交完成 / 取消，以及完成后互评。"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from .. import db
from ..deps import get_current_user
from ..schemas import OrderActionIn, OrderIn, ReviewIn
from ..utils import PRODUCT_STATUS_LABELS, decorate_order, gen_order_no, page_params

router = APIRouter(prefix="/api/orders", tags=["订单"])

_ORDER_SELECT = """
SELECT o.*,
       b.nickname AS buyer_nickname, b.avatar AS buyer_avatar, b.campus AS buyer_campus,
       s.nickname AS seller_nickname, s.avatar AS seller_avatar, s.campus AS seller_campus,
       p.cover AS product_cover, p.status AS product_status,
       (SELECT COUNT(*) FROM reviews r WHERE r.order_id = o.id) AS review_count,
       EXISTS(SELECT 1 FROM reviews r2 WHERE r2.order_id = o.id AND r2.from_user_id = %s) AS reviewed_by_me
FROM orders o
JOIN users b ON b.id = o.buyer_id
JOIN users s ON s.id = o.seller_id
LEFT JOIN products p ON p.id = o.product_id
"""


@router.get("/summary", summary="订单角标统计")
def order_summary(user: dict = Depends(get_current_user)):
    uid = int(user["id"])
    rows = db.query_all(
        """SELECT status, buyer_id = %s AS as_buyer, COUNT(*) AS cnt
           FROM orders
           WHERE buyer_id = %s OR seller_id = %s
           GROUP BY status, as_buyer""",
        (uid, uid, uid),
    )
    stats = {
        "buyer": {"pending": 0, "accepted": 0, "completed": 0, "cancelled": 0, "total": 0},
        "seller": {"pending": 0, "accepted": 0, "completed": 0, "cancelled": 0, "total": 0},
    }
    for row in rows:
        side = "buyer" if int(row["as_buyer"]) == 1 else "seller"
        count = int(row["cnt"])
        stats[side][row["status"]] = count
        stats[side]["total"] += count
    stats["pending_action"] = stats["seller"]["pending"] + stats["buyer"]["accepted"]
    return stats


@router.post("", summary="创建订单（下单）")
@router.post("/", include_in_schema=False)
def create_order(payload: OrderIn, user: dict = Depends(get_current_user)):
    with db.get_cursor() as cur:
        cur.execute(
            """SELECT id, seller_id, title, cover, price, status, is_deleted
               FROM products WHERE id = %s FOR UPDATE""",
            (payload.product_id,),
        )
        product = cur.fetchone()
        if not product or int(product["is_deleted"]) == 1:
            raise HTTPException(status_code=404, detail="商品不存在或已删除")
        if int(product["seller_id"]) == int(user["id"]):
            raise HTTPException(status_code=400, detail="不能购买自己发布的商品")
        if product["status"] != "on_sale":
            label = PRODUCT_STATUS_LABELS.get(product["status"], product["status"])
            raise HTTPException(status_code=400, detail=f"商品当前为「{label}」，无法下单")

        order_no = gen_order_no()
        cur.execute(
            """INSERT INTO orders
                 (order_no, product_id, buyer_id, seller_id, title_snapshot, cover_snapshot,
                  amount, trade_place, trade_time, remark, status)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'pending')""",
            (
                order_no,
                product["id"],
                user["id"],
                product["seller_id"],
                product["title"],
                product["cover"],
                product["price"],
                (payload.trade_place or product.get("trade_place") or "").strip() or None,
                (payload.trade_time or "").strip() or None,
                (payload.remark or "").strip() or None,
            ),
        )
        order_id = int(cur.lastrowid)
        cur.execute("UPDATE products SET status = 'reserved' WHERE id = %s", (product["id"],))

    return {"id": order_id, "order_no": order_no, "message": "下单成功，等待卖家确认"}


@router.get("", summary="我的订单")
@router.get("/", include_in_schema=False)
def list_orders(
    role: str = Query(default="all", pattern="^(all|buyer|seller)$"),
    status: Optional[str] = Query(
        default=None, pattern="^(pending|accepted|completed|cancelled)$"
    ),
    page: int = Query(default=1, ge=1),
    size: int = Query(default=10, ge=1, le=50),
    user: dict = Depends(get_current_user),
):
    uid = int(user["id"])
    where = []
    args: list = [uid]
    if role == "buyer":
        where.append("o.buyer_id = %s")
        args.append(uid)
    elif role == "seller":
        where.append("o.seller_id = %s")
        args.append(uid)
    else:
        where.append("(o.buyer_id = %s OR o.seller_id = %s)")
        args.extend([uid, uid])
    if status:
        where.append("o.status = %s")
        args.append(status)
    where_sql = " AND ".join(where)

    total = int(
        # args[0] 是为 _ORDER_SELECT 预留的位置，COUNT 不需要
        db.query_scalar(
            f"SELECT COUNT(*) FROM orders o WHERE {where_sql}", args[1:], default=0
        )
    )
    offset, limit = page_params(page, size, max_size=50)
    rows = db.query_all(
        f"""{_ORDER_SELECT}
        WHERE {where_sql}
        ORDER BY o.created_at DESC, o.id DESC
        LIMIT %s OFFSET %s""",
        args + [limit, offset],
    )
    return {
        "items": [decorate_order(r) for r in rows],
        "total": total,
        "page": page,
        "size": limit,
        "pages": (total + limit - 1) // limit if limit else 0,
    }


@router.get("/{order_id}", summary="订单详情")
def get_order(order_id: int, user: dict = Depends(get_current_user)):
    uid = int(user["id"])
    row = db.query_one(f"{_ORDER_SELECT} WHERE o.id = %s", (uid, order_id))
    if not row:
        raise HTTPException(status_code=404, detail="订单不存在")
    if int(row["buyer_id"]) != uid and int(row["seller_id"]) != uid and user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="无权查看该订单")
    order = decorate_order(row)
    order["my_role"] = "buyer" if int(row["buyer_id"]) == uid else "seller"
    order["reviews"] = db.query_all(
        """SELECT r.rating, r.content, r.created_at, r.from_user_id, u.nickname AS from_nickname
           FROM reviews r JOIN users u ON u.id = r.from_user_id
           WHERE r.order_id = %s ORDER BY r.id ASC""",
        (order_id,),
    )
    return order


@router.post("/{order_id}/action", summary="订单操作：接单/完成/取消")
def order_action(order_id: int, payload: OrderActionIn, user: dict = Depends(get_current_user)):
    uid = int(user["id"])
    with db.get_cursor() as cur:
        cur.execute("SELECT * FROM orders WHERE id = %s FOR UPDATE", (order_id,))
        order = cur.fetchone()
        if not order:
            raise HTTPException(status_code=404, detail="订单不存在")

        is_buyer = int(order["buyer_id"]) == uid
        is_seller = int(order["seller_id"]) == uid
        if not (is_buyer or is_seller):
            raise HTTPException(status_code=403, detail="无权操作该订单")
        status = order["status"]

        if payload.action == "accept":
            if not is_seller:
                raise HTTPException(status_code=403, detail="只有卖家可以确认接单")
            if status != "pending":
                raise HTTPException(status_code=400, detail="只有待确认的订单可以接单")
            cur.execute(
                "UPDATE orders SET status = 'accepted', accepted_at = NOW() WHERE id = %s",
                (order_id,),
            )
            db.execute(
                "INSERT INTO messages (from_user_id, to_user_id, product_id, content) VALUES (%s, %s, %s, %s)",
                (uid, order["buyer_id"], order["product_id"], f"我已确认订单 {order['order_no']}，我们约个时间面交吧～"),
            )
            return {"ok": True, "status": "accepted", "message": "已接单"}

        if payload.action == "complete":
            if status not in ("pending", "accepted"):
                raise HTTPException(status_code=400, detail="当前状态无法标记完成")
            cur.execute(
                "UPDATE orders SET status = 'completed', completed_at = NOW() WHERE id = %s",
                (order_id,),
            )
            cur.execute(
                "UPDATE products SET status = 'sold' WHERE id = %s", (order["product_id"],)
            )
            peer = order["seller_id"] if is_buyer else order["buyer_id"]
            db.execute(
                "INSERT INTO messages (from_user_id, to_user_id, product_id, content) VALUES (%s, %s, %s, %s)",
                (uid, peer, order["product_id"], f"订单 {order['order_no']} 已标记完成，别忘了评价对方哦～"),
            )
            return {"ok": True, "status": "completed", "message": "交易完成"}

        # cancel
        if status not in ("pending", "accepted"):
            raise HTTPException(status_code=400, detail="当前状态无法取消")
        cur.execute(
            """UPDATE orders SET status = 'cancelled', cancelled_at = NOW(),
                      cancel_reason = %s
               WHERE id = %s""",
            ((payload.reason or "").strip() or None, order_id),
        )
        cur.execute(
            """UPDATE products SET status = 'on_sale'
               WHERE id = %s AND status = 'reserved'""",
            (order["product_id"],),
        )
        peer = order["seller_id"] if is_buyer else order["buyer_id"]
        db.execute(
            "INSERT INTO messages (from_user_id, to_user_id, product_id, content) VALUES (%s, %s, %s, %s)",
            (uid, peer, order["product_id"], f"订单 {order['order_no']} 已取消"),
        )
        return {"ok": True, "status": "cancelled", "message": "订单已取消"}


@router.post("/{order_id}/review", summary="评价交易对方")
def create_review(order_id: int, payload: ReviewIn, user: dict = Depends(get_current_user)):
    uid = int(user["id"])
    order = db.query_one("SELECT * FROM orders WHERE id = %s", (order_id,))
    if not order:
        raise HTTPException(status_code=404, detail="订单不存在")
    is_buyer = int(order["buyer_id"]) == uid
    is_seller = int(order["seller_id"]) == uid
    if not (is_buyer or is_seller):
        raise HTTPException(status_code=403, detail="无权评价该订单")
    if order["status"] != "completed":
        raise HTTPException(status_code=400, detail="交易完成后才能评价")

    if db.query_one(
        "SELECT id FROM reviews WHERE order_id = %s AND from_user_id = %s", (order_id, uid)
    ):
        raise HTTPException(status_code=400, detail="你已经评价过这笔交易了")

    to_user_id = int(order["seller_id"]) if is_buyer else int(order["buyer_id"])
    db.execute(
        """INSERT INTO reviews (order_id, product_id, from_user_id, to_user_id, rating, content)
           VALUES (%s, %s, %s, %s, %s, %s)""",
        (
            order_id,
            order["product_id"],
            uid,
            to_user_id,
            payload.rating,
            (payload.content or "").strip() or None,
        ),
    )
    db.execute(
        """UPDATE users SET rating_sum = rating_sum + %s, rating_count = rating_count + 1
           WHERE id = %s""",
        (payload.rating, to_user_id),
    )
    return {"ok": True, "message": "评价成功，感谢反馈"}

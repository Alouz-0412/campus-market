"""站内消息：买家与卖家围绕商品的沟通。"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from .. import db
from ..deps import get_current_user
from ..schemas import MessageIn
from ..utils import page_params

router = APIRouter(prefix="/api/messages", tags=["消息"])


@router.get("/conversations", summary="会话列表")
def conversations(user: dict = Depends(get_current_user)):
    uid = int(user["id"])
    rows = db.query_all(
        """SELECT t.peer_id,
                  u.nickname AS peer_nickname, u.avatar AS peer_avatar, u.campus AS peer_campus,
                  t.last_at,
                  (SELECT m2.content FROM messages m2
                    WHERE (m2.from_user_id = t.peer_id AND m2.to_user_id = %s)
                       OR (m2.from_user_id = %s AND m2.to_user_id = t.peer_id)
                    ORDER BY m2.created_at DESC, m2.id DESC LIMIT 1) AS last_content,
                  (SELECT COUNT(*) FROM messages m3
                    WHERE m3.from_user_id = t.peer_id AND m3.to_user_id = %s
                      AND m3.is_read = 0) AS unread
           FROM (
                SELECT IF(from_user_id = %s, to_user_id, from_user_id) AS peer_id,
                       MAX(created_at) AS last_at
                FROM messages
                WHERE from_user_id = %s OR to_user_id = %s
                GROUP BY peer_id
           ) t
           JOIN users u ON u.id = t.peer_id
           ORDER BY t.last_at DESC
           LIMIT 200""",
        (uid, uid, uid, uid, uid, uid),
    )
    return {"items": rows}


@router.get("/unread-count", summary="未读消息数")
def unread_count(user: dict = Depends(get_current_user)):
    total = int(
        db.query_scalar(
            "SELECT COUNT(*) FROM messages WHERE to_user_id = %s AND is_read = 0",
            (user["id"],),
            default=0,
        )
    )
    return {"unread": total}


@router.get("/thread", summary="与某人的消息记录")
def thread(
    peer_id: int = Query(..., ge=1),
    product_id: Optional[int] = Query(default=None, ge=1),
    page: int = Query(default=1, ge=1),
    size: int = Query(default=50, ge=1, le=200),
    user: dict = Depends(get_current_user),
):
    uid = int(user["id"])
    if peer_id == uid:
        raise HTTPException(status_code=400, detail="不能和自己聊天")
    peer = db.query_one("SELECT id, nickname, avatar, campus FROM users WHERE id = %s", (peer_id,))
    if not peer:
        raise HTTPException(status_code=404, detail="对方不存在")

    offset, limit = page_params(page, size, max_size=200)
    rows = db.query_all(
        """SELECT id, from_user_id, to_user_id, product_id, content, is_read, created_at
           FROM messages
           WHERE ((from_user_id = %s AND to_user_id = %s)
               OR (from_user_id = %s AND to_user_id = %s))
           ORDER BY created_at DESC, id DESC
           LIMIT %s OFFSET %s""",
        (uid, peer_id, peer_id, uid, limit, offset),
    )
    rows.reverse()

    db.execute(
        "UPDATE messages SET is_read = 1 WHERE from_user_id = %s AND to_user_id = %s AND is_read = 0",
        (peer_id, uid),
    )

    products = []
    if product_id:
        products = db.query_all(
            "SELECT id, title, cover, price, status FROM products WHERE id = %s", (product_id,)
        )
    return {"peer": peer, "items": rows, "product": products[0] if products else None}


@router.post("", summary="发送消息")
@router.post("/", include_in_schema=False)
def send_message(payload: MessageIn, user: dict = Depends(get_current_user)):
    uid = int(user["id"])
    if payload.to_user_id == uid:
        raise HTTPException(status_code=400, detail="不能给自己发消息")
    receiver = db.query_one("SELECT id, status FROM users WHERE id = %s", (payload.to_user_id,))
    if not receiver or int(receiver["status"] or 0) != 1:
        raise HTTPException(status_code=404, detail="对方不存在或已被禁用")
    if payload.product_id and not db.query_one(
        "SELECT id FROM products WHERE id = %s", (payload.product_id,)
    ):
        raise HTTPException(status_code=404, detail="关联的商品不存在")

    message_id = db.insert(
        """INSERT INTO messages (from_user_id, to_user_id, product_id, content)
           VALUES (%s, %s, %s, %s)""",
        (uid, payload.to_user_id, payload.product_id, payload.content.strip()),
    )
    row = db.query_one(
        """SELECT id, from_user_id, to_user_id, product_id, content, is_read, created_at
           FROM messages WHERE id = %s""",
        (message_id,),
    )
    return row


@router.post("/read", summary="把与某人的消息标记为已读")
def mark_read(peer_id: int = Query(..., ge=1), user: dict = Depends(get_current_user)):
    affected = db.execute(
        "UPDATE messages SET is_read = 1 WHERE from_user_id = %s AND to_user_id = %s AND is_read = 0",
        (peer_id, user["id"]),
    )
    return {"ok": True, "updated": affected}

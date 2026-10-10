"""分类、商品、收藏、图片上传。"""

from __future__ import annotations

import io
import secrets
import time
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.params import Query as QueryParam

from .. import db
from ..config import settings
from ..deps import get_current_user, get_optional_user, public_user, USER_COLUMNS
from ..schemas import ProductIn, ProductStatusIn
from ..utils import decorate_product, escape_like, page_params

router = APIRouter(prefix="/api", tags=["商品"])

SORTS = {
    "latest": "p.created_at DESC, p.id DESC",
    "price_asc": "p.price ASC, p.id DESC",
    "price_desc": "p.price DESC, p.id DESC",
    "popular": "p.view_count DESC, p.id DESC",
    "favorite": "p.favorite_count DESC, p.id DESC",
}

_LIST_SELECT = """
SELECT p.id, p.title, p.description, p.price, p.original_price, p.condition_level,
       p.trade_place, p.cover, p.status, p.view_count, p.favorite_count,
       p.created_at, p.updated_at, p.seller_id, p.category_id,
       u.nickname AS seller_nickname, u.avatar AS seller_avatar, u.campus AS seller_campus,
       c.name AS category_name, c.icon AS category_icon,
       (f.id IS NOT NULL) AS is_favorited
FROM products p
JOIN users u ON u.id = p.seller_id
JOIN categories c ON c.id = p.category_id
LEFT JOIN favorites f ON f.product_id = p.id AND f.user_id = %s
"""


# ---------------------------------------------------------------- 分类 ----

@router.get("/categories", summary="分类列表（含在售数量）")
def list_categories():
    rows = db.query_all(
        """SELECT c.id, c.name, c.icon, c.sort,
                  (SELECT COUNT(*) FROM products p
                    WHERE p.category_id = c.id AND p.is_deleted = 0
                      AND p.status IN ('on_sale','reserved')) AS product_count
           FROM categories c
           ORDER BY c.sort ASC, c.id ASC"""
    )
    return {"items": rows}


@router.get("/stats", summary="平台公开统计（首页展示）")
def public_stats():
    """不涉及隐私的聚合数据，用于首页横幅。"""
    row = db.query_one(
        """SELECT
             (SELECT COUNT(*) FROM products WHERE is_deleted = 0 AND status = 'on_sale') AS products_on_sale,
             (SELECT COUNT(*) FROM users  WHERE status = 1)                              AS users,
             (SELECT COUNT(*) FROM orders WHERE status = 'completed')                    AS completed_orders"""
    )
    return row or {"products_on_sale": 0, "users": 0, "completed_orders": 0}


# ---------------------------------------------------------------- 商品 ----

def _plain(value, fallback=None):
    """把 FastAPI 的 Query(...) 默认对象还原成普通值。

    路由函数被当作普通 Python 函数直接调用时（例如 my_products 复用 list_products），
    没显式传入的参数会保留 Query(default=None, ...) 对象——它既不等于 None 又是真值，
    于是 `if condition_level:` 之类的判断会全部命中，塞进永远匹配不到的过滤条件。
    凡是从别的路由转发进来的查询参数，都先过一遍这里兜底。
    """
    if isinstance(value, QueryParam):  # fastapi.params.Query 实例
        return fallback
    return value


@router.get("/products", summary="商品列表/搜索")
def list_products(
    keyword: Optional[str] = None,
    category_id: Optional[int] = None,
    seller_id: Optional[int] = None,
    status: str = Query(default="active", pattern="^(active|on_sale|reserved|sold|off_shelf|all)$"),
    condition_level: Optional[int] = Query(default=None, ge=1, le=4),
    min_price: Optional[float] = Query(default=None, ge=0),
    max_price: Optional[float] = Query(default=None, ge=0),
    sort: str = Query(default="latest", pattern="^(latest|price_asc|price_desc|popular|favorite)$"),
    campus_first: bool = Query(default=False, description="同校区优先（需登录且有校区）"),
    page: int = Query(default=1, ge=1),
    size: int = Query(default=12, ge=1, le=60),
    viewer: Optional[dict] = Depends(get_optional_user),
):
    # 兼容「被其它路由直接调用」的场景，见 _plain 的说明
    keyword = _plain(keyword)
    category_id = _plain(category_id)
    seller_id = _plain(seller_id)
    condition_level = _plain(condition_level)
    min_price = _plain(min_price)
    max_price = _plain(max_price)
    campus_first = _plain(campus_first, False)
    viewer = _plain(viewer)

    where = ["p.is_deleted = 0", "u.status = 1"]
    args: list = [int(viewer["id"]) if viewer else 0]

    if status == "active":
        where.append("p.status IN ('on_sale','reserved')")
    elif status != "all":
        where.append("p.status = %s")
        args.append(status)

    if keyword:
        kw = f"%{escape_like(keyword.strip())}%"
        where.append("(p.title LIKE %s ESCAPE '\\\\' OR p.description LIKE %s ESCAPE '\\\\')")
        args.extend([kw, kw])

    if category_id:
        where.append("p.category_id = %s")
        args.append(category_id)
    if seller_id:
        where.append("p.seller_id = %s")
        args.append(seller_id)
    if condition_level:
        where.append("p.condition_level = %s")
        args.append(condition_level)
    if min_price is not None:
        where.append("p.price >= %s")
        args.append(min_price)
    if max_price is not None:
        where.append("p.price <= %s")
        args.append(max_price)

    where_sql = " AND ".join(where)
    # 注意：args[0] 是 _LIST_SELECT 里 favorites 联表用的 viewer 占位符，
    # COUNT 语句不含它，必须剔除，否则 PyMySQL 报 not all arguments converted。
    total = int(
        db.query_scalar(
            f"""SELECT COUNT(*) FROM products p
                JOIN users u ON u.id = p.seller_id
                WHERE {where_sql}""",
            args[1:],
            default=0,
        )
    )

    offset, limit = page_params(page, size)

    # 同校区优先：把「卖家校区 == 我的校区」的商品提到最前面，同校区内部再按选定规则排。
    # 占位符出现在 ORDER BY 里，所以参数必须接在 WHERE 参数之后、LIMIT/OFFSET 之前；
    # COUNT 语句不含 ORDER BY，因此不受影响（仍然只吃 args[1:]）。
    order_sql = SORTS[sort]
    order_args: list = []
    my_campus = (viewer or {}).get("campus") or ""
    if campus_first and my_campus:
        order_sql = "CASE WHEN u.campus = %s THEN 0 ELSE 1 END ASC, " + order_sql
        order_args.append(my_campus)

    rows = db.query_all(
        f"""{_LIST_SELECT}
        WHERE {where_sql}
        ORDER BY {order_sql}
        LIMIT %s OFFSET %s""",
        args + order_args + [limit, offset],
    )
    pages = (total + limit - 1) // limit if limit else 0
    return {
        "items": [decorate_product(r) for r in rows],
        "total": total,
        "page": page,
        "size": limit,
        "pages": pages,
    }


@router.get("/products/mine", summary="我发布的商品")
def my_products(
    status: str = Query(default="all", pattern="^(active|on_sale|reserved|sold|off_shelf|all)$"),
    page: int = Query(default=1, ge=1),
    size: int = Query(default=12, ge=1, le=60),
    user: dict = Depends(get_current_user),
):
    return list_products(
        seller_id=int(user["id"]),
        status=status,
        page=page,
        size=size,
        sort="latest",
        viewer=user,
    )


@router.get("/products/{product_id}", summary="商品详情")
def get_product(product_id: int, viewer: Optional[dict] = Depends(get_optional_user)):
    row = db.query_one(
        f"""{_LIST_SELECT}
        WHERE p.id = %s AND p.is_deleted = 0""",
        [int(viewer["id"]) if viewer else 0, product_id],
    )
    if not row:
        raise HTTPException(status_code=404, detail="商品不存在或已删除")

    db.execute("UPDATE products SET view_count = view_count + 1 WHERE id = %s", (product_id,))
    item = decorate_product(row)
    item["view_count"] = int(item.get("view_count") or 0) + 1

    item["images"] = [
        r["url"]
        for r in db.query_all(
            "SELECT url FROM product_images WHERE product_id = %s ORDER BY sort ASC, id ASC",
            (product_id,),
        )
    ]
    if not item["images"] and item.get("cover"):
        item["images"] = [item["cover"]]

    seller = db.query_one(
        f"SELECT {USER_COLUMNS} FROM users WHERE id = %s", (row["seller_id"],)
    )
    item["seller"] = public_user(seller)

    item["seller_product_count"] = int(
        db.query_scalar(
            """SELECT COUNT(*) FROM products
               WHERE seller_id = %s AND is_deleted = 0
                 AND status IN ('on_sale','reserved')""",
            (row["seller_id"],),
            default=0,
        )
    )
    return item


def _save_images(product_id: int, images: list[str]) -> None:
    db.execute("DELETE FROM product_images WHERE product_id = %s", (product_id,))
    rows = [(product_id, url, index) for index, url in enumerate(images[:9]) if url]
    if rows:
        db.insert_many(
            "INSERT INTO product_images (product_id, url, sort) VALUES (%s, %s, %s)", rows
        )


@router.post("/products", summary="发布商品")
def create_product(payload: ProductIn, user: dict = Depends(get_current_user)):
    if not db.query_one("SELECT id FROM categories WHERE id = %s", (payload.category_id,)):
        raise HTTPException(status_code=400, detail="分类不存在")

    images = [u for u in (payload.images or []) if u][:9]
    product_id = db.insert(
        """INSERT INTO products
             (seller_id, category_id, title, description, price, original_price,
              condition_level, trade_place, cover, status)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, 'on_sale')""",
        (
            user["id"],
            payload.category_id,
            payload.title.strip(),
            (payload.description or "").strip() or None,
            payload.price,
            payload.original_price,
            payload.condition_level,
            (payload.trade_place or "").strip() or None,
            images[0] if images else None,
        ),
    )
    _save_images(int(product_id), images)
    return {"id": product_id, "message": "发布成功"}


@router.put("/products/{product_id}", summary="编辑商品")
def update_product(
    product_id: int, payload: ProductIn, user: dict = Depends(get_current_user)
):
    row = db.query_one(
        "SELECT id, seller_id, status FROM products WHERE id = %s AND is_deleted = 0",
        (product_id,),
    )
    if not row:
        raise HTTPException(status_code=404, detail="商品不存在")
    if int(row["seller_id"]) != int(user["id"]) and user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="只能编辑自己发布的商品")
    if row["status"] == "sold":
        raise HTTPException(status_code=400, detail="已售出的商品不能编辑")

    images = [u for u in (payload.images or []) if u][:9]
    db.execute(
        """UPDATE products SET category_id = %s, title = %s, description = %s,
                  price = %s, original_price = %s, condition_level = %s,
                  trade_place = %s, cover = %s
           WHERE id = %s""",
        (
            payload.category_id,
            payload.title.strip(),
            (payload.description or "").strip() or None,
            payload.price,
            payload.original_price,
            payload.condition_level,
            (payload.trade_place or "").strip() or None,
            images[0] if images else None,
            product_id,
        ),
    )
    _save_images(product_id, images)
    return {"ok": True, "message": "已保存"}


@router.post("/products/{product_id}/status", summary="上架/下架/预定/售出")
def change_product_status(
    product_id: int, payload: ProductStatusIn, user: dict = Depends(get_current_user)
):
    row = db.query_one("SELECT seller_id, status FROM products WHERE id = %s AND is_deleted = 0", (product_id,))
    if not row:
        raise HTTPException(status_code=404, detail="商品不存在")
    if int(row["seller_id"]) != int(user["id"]) and user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="无权操作该商品")
    if row["status"] == "sold" and payload.status != "sold":
        raise HTTPException(status_code=400, detail="已售出的商品不能再改状态")

    db.execute("UPDATE products SET status = %s WHERE id = %s", (payload.status, product_id))
    return {"ok": True, "status": payload.status}


@router.delete("/products/{product_id}", summary="删除商品（软删除）")
def delete_product(product_id: int, user: dict = Depends(get_current_user)):
    row = db.query_one("SELECT seller_id FROM products WHERE id = %s AND is_deleted = 0", (product_id,))
    if not row:
        raise HTTPException(status_code=404, detail="商品不存在")
    if int(row["seller_id"]) != int(user["id"]) and user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="无权删除该商品")
    db.execute("UPDATE products SET is_deleted = 1, status = 'off_shelf' WHERE id = %s", (product_id,))
    return {"ok": True, "message": "已删除"}


# ---------------------------------------------------------------- 收藏 ----

@router.post("/products/{product_id}/favorite", summary="收藏/取消收藏")
def toggle_favorite(product_id: int, user: dict = Depends(get_current_user)):
    if not db.query_one("SELECT id FROM products WHERE id = %s AND is_deleted = 0", (product_id,)):
        raise HTTPException(status_code=404, detail="商品不存在")

    existing = db.query_one(
        "SELECT id FROM favorites WHERE user_id = %s AND product_id = %s",
        (user["id"], product_id),
    )
    if existing:
        db.execute("DELETE FROM favorites WHERE id = %s", (existing["id"],))
        db.execute(
            "UPDATE products SET favorite_count = GREATEST(favorite_count - 1, 0) WHERE id = %s",
            (product_id,),
        )
        favorited = False
    else:
        db.execute(
            "INSERT IGNORE INTO favorites (user_id, product_id) VALUES (%s, %s)",
            (user["id"], product_id),
        )
        db.execute(
            "UPDATE products SET favorite_count = favorite_count + 1 WHERE id = %s",
            (product_id,),
        )
        favorited = True

    count = int(
        db.query_scalar("SELECT favorite_count FROM products WHERE id = %s", (product_id,), default=0)
    )
    return {"favorited": favorited, "favorite_count": count}


@router.get("/favorites", summary="我的收藏")
def my_favorites(
    page: int = Query(default=1, ge=1),
    size: int = Query(default=12, ge=1, le=60),
    user: dict = Depends(get_current_user),
):
    offset, limit = page_params(page, size)
    total = int(
        db.query_scalar(
            """SELECT COUNT(*) FROM favorites f
               JOIN products p ON p.id = f.product_id AND p.is_deleted = 0
               WHERE f.user_id = %s""",
            (user["id"],),
            default=0,
        )
    )
    rows = db.query_all(
        f"""{_LIST_SELECT}
        JOIN favorites mf ON mf.product_id = p.id AND mf.user_id = %s
        WHERE p.is_deleted = 0
        ORDER BY mf.created_at DESC
        LIMIT %s OFFSET %s""",
        (int(user["id"]), int(user["id"]), limit, offset),
    )
    return {
        "items": [decorate_product(r) for r in rows],
        "total": total,
        "page": page,
        "size": limit,
        "pages": (total + limit - 1) // limit if limit else 0,
    }


# ---------------------------------------------------------------- 上传 ----

@router.post("/upload", summary="上传图片")
async def upload_image(
    file: UploadFile = File(...), user: dict = Depends(get_current_user)
):
    from PIL import Image, UnidentifiedImageError

    settings.ensure_dirs()
    raw = await file.read()
    limit = settings.MAX_UPLOAD_MB * 1024 * 1024
    if len(raw) > limit:
        raise HTTPException(status_code=400, detail=f"图片不能超过 {settings.MAX_UPLOAD_MB} MB")
    if not raw:
        raise HTTPException(status_code=400, detail="空文件")

    try:
        image = Image.open(io.BytesIO(raw))
        image.load()
    except (UnidentifiedImageError, OSError):
        raise HTTPException(status_code=400, detail="无法识别的图片格式")

    has_alpha = image.mode in ("RGBA", "LA", "P") and "transparency" in image.info or image.mode in ("RGBA", "LA")
    if image.mode not in ("RGB", "RGBA"):
        image = image.convert("RGBA" if has_alpha else "RGB")

    image.thumbnail((1280, 1280), Image.LANCZOS)

    extension = "png" if has_alpha and image.mode == "RGBA" else "jpg"
    filename = f"{user['id']}_{int(time.time() * 1000)}_{secrets.token_hex(3)}.{extension}"
    target = settings.UPLOAD_DIR / filename

    if extension == "jpg":
        image.convert("RGB").save(target, "JPEG", quality=86, optimize=True)
    else:
        image.save(target, "PNG", optimize=True)

    return {"url": f"/uploads/{filename}", "filename": filename}

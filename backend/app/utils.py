"""零散工具函数。"""

from __future__ import annotations

import random
import re
import time
from typing import Any, Optional

CONDITION_LABELS = {
    1: "全新",
    2: "几乎全新",
    3: "轻微使用痕迹",
    4: "明显使用",
}

PRODUCT_STATUS_LABELS = {
    "on_sale": "在售",
    "reserved": "已预定",
    "sold": "已售出",
    "off_shelf": "已下架",
}

ORDER_STATUS_LABELS = {
    "pending": "待卖家确认",
    "accepted": "待面交",
    "completed": "已完成",
    "cancelled": "已取消",
}


def gen_order_no() -> str:
    """CM + 年月日时分秒 + 4 位随机，便于人工核对。"""
    return "CM{}{:04d}".format(time.strftime("%Y%m%d%H%M%S"), random.randint(0, 9999))


def page_params(page: int = 1, size: int = 12, max_size: int = 60) -> tuple[int, int]:
    page = max(1, int(page or 1))
    size = int(size or 12)
    if size < 1:
        size = 12
    size = min(size, max_size)
    return (page - 1) * size, size


def escape_like(text: str) -> str:
    """转义 LIKE 通配符，配合 ESCAPE '\\\\' 使用。"""
    return re.sub(r"([\\%_])", r"\\\1", text)


def decorate_product(row: Optional[dict]) -> Optional[dict]:
    """给商品行补上中文状态/成色，以及价格展示字段。"""
    if not row:
        return None
    item = dict(row)
    item["condition_label"] = CONDITION_LABELS.get(int(item.get("condition_level") or 2), "未知")
    item["status_label"] = PRODUCT_STATUS_LABELS.get(item.get("status"), item.get("status"))
    item["price"] = float(item.get("price") or 0)
    if item.get("original_price") is not None:
        item["original_price"] = float(item["original_price"])
    return item


def decorate_order(row: Optional[dict]) -> Optional[dict]:
    if not row:
        return None
    item = dict(row)
    item["status_label"] = ORDER_STATUS_LABELS.get(item.get("status"), item.get("status"))
    item["amount"] = float(item.get("amount") or 0)
    return item


def clamp_rating(value: Any, default: int = 5) -> int:
    try:
        return max(1, min(5, int(value)))
    except (TypeError, ValueError):
        return default

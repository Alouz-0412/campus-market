"""端到端冒烟测试：把整个平台的真实 HTTP 流程跑一遍。

用法：python backend/scripts/smoke_test.py [base_url]
默认 base_url = http://127.0.0.1:8000
"""

from __future__ import annotations

import io
import os
import shutil
import subprocess
import sys
import tempfile
import traceback
from pathlib import Path

import httpx
from PIL import Image

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8000").rstrip("/")

PASSED: list[str] = []
FAILED: list[str] = []


def check(name: str, cond: bool, extra: str = "") -> bool:
    if cond:
        PASSED.append(name)
        print(f"  [PASS] {name}")
    else:
        FAILED.append(f"{name} {extra}")
        print(f"  [FAIL] {name} {extra}")
    return cond


def section(title: str) -> None:
    print(f"\n=== {title} ===")


def req(method: str, path: str, token: str | None = None, **kw) -> httpx.Response:
    headers = kw.pop("headers", {})
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return httpx.request(method, BASE + path, headers=headers, timeout=20, **kw)


def main() -> int:
    client_ok = False
    try:
        r = httpx.get(BASE + "/api/health", timeout=10)
        client_ok = r.status_code == 200
    except Exception as exc:  # noqa: BLE001
        print(f"无法连接后端 {BASE}：{exc}")
        return 2

    section("0. 健康检查")
    check("GET /api/health -> 200", client_ok)
    r = req("GET", "/api/health")
    check("health 返回 ok", r.status_code == 200 and r.json().get("ok") is True, r.text[:200])
    check("health 数据库已连通", bool(r.json().get("database")), r.text[:200])

    # ---------------------------------------------------------------- 认证
    section("1. 认证")
    r = req("POST", "/api/auth/login", json={"username": "admin", "password": "admin123"})
    check("管理员登录 -> 200", r.status_code == 200, r.text[:200])
    admin = r.json()
    admin_tok = admin.get("token")
    check("登录返回 token", bool(admin_tok))
    check("管理员 role=admin", admin.get("user", {}).get("role") == "admin")
    check("user 不含 password_hash", "password_hash" not in admin.get("user", {}))
    check("user 含 rating_avg 字段", "rating_avg" in admin.get("user", {}))

    r = req("POST", "/api/auth/login", json={"username": "xiaoming", "password": "123456"})
    check("普通用户登录 -> 200", r.status_code == 200, r.text[:200])
    seller_tok = r.json()["token"]
    seller = r.json()["user"]

    r = req("POST", "/api/auth/login", json={"username": "lihua", "password": "123456"})
    check("买家登录 -> 200", r.status_code == 200, r.text[:200])
    buyer_tok = r.json()["token"]
    buyer = r.json()["user"]

    r = req("POST", "/api/auth/login", json={"username": "chenjie", "password": "123456"})
    outsider_tok = r.json()["token"]
    outsider = r.json()["user"]

    r = req("POST", "/api/auth/login", json={"username": "xiaoming", "password": "wrong-pass"})
    check("错误密码 -> 400", r.status_code == 400, f"got {r.status_code}")

    r = req("POST", "/api/auth/register", json={
        "username": "smoke_tester", "password": "test123456",
        "nickname": "冒烟测试员", "campus": "测试校区", "email": "smoke@test.dev",
    })
    if r.status_code == 400:
        r = req("POST", "/api/auth/login", json={"username": "smoke_tester", "password": "test123456"})
    check("注册/登录新用户 -> 200", r.status_code == 200, r.text[:200])
    new_tok = r.json()["token"]

    r = req("POST", "/api/auth/register", json={"username": "ab", "password": "test123456"})
    check("非法用户名 -> 422", r.status_code == 422, f"got {r.status_code}")

    r = req("GET", "/api/auth/me", token=seller_tok)
    check("GET /me -> 200 且是本人", r.status_code == 200 and r.json()["username"] == "xiaoming", r.text[:200])

    r = req("GET", "/api/auth/me")
    check("未登录 GET /me -> 401", r.status_code == 401, f"got {r.status_code}")

    r = req("PUT", "/api/auth/me", token=new_tok, json={"bio": "冒烟测试自动写入的简介", "campus": "测试校区"})
    check("PUT /me 更新资料 -> 200", r.status_code == 200, r.text[:200])
    me_body = r.json()
    me_obj = me_body.get("user", me_body)
    check("资料已更新", me_obj.get("bio") == "冒烟测试自动写入的简介", r.text[:200])

    # ---------------------------------------------------------------- 商品
    section("2. 商品与分类")
    r = req("GET", "/api/categories")
    cats = r.json().get("items", [])
    check("GET /api/categories -> 200", r.status_code == 200)
    check("分类不少于 5 个", len(cats) >= 5, f"got {len(cats)}")
    check("分类含 product_count", cats and "product_count" in cats[0], str(cats[:1]))
    cat_id = cats[0]["id"]

    r = req("GET", "/api/products?page=1&size=6")
    page = r.json()
    check("GET /api/products -> 200", r.status_code == 200, r.text[:200])
    check("分页字段齐全", {"items", "total", "page", "size", "pages"} <= set(page), str(list(page)))
    check("每页 6 条", len(page["items"]) <= 6, str(len(page["items"])))
    check("列表带 is_favorited", page["items"] and "is_favorited" in page["items"][0], str(page["items"][:1]))
    check("列表带 seller_nickname", page["items"] and "seller_nickname" in page["items"][0])

    existing_id = page["items"][0]["id"]
    r = req("GET", f"/api/products/{existing_id}", token=buyer_tok)
    detail = r.json()
    check("商品详情 -> 200", r.status_code == 200, r.text[:200])
    check("详情含 images[]", isinstance(detail.get("images"), list), str(type(detail.get("images"))))
    check("详情含 seller", isinstance(detail.get("seller"), dict))
    check("详情含 condition_label", bool(detail.get("condition_label")))
    check("详情含 seller_product_count", "seller_product_count" in detail)

    r = req("GET", "/api/products/999999")
    check("不存在的商品 -> 404", r.status_code == 404, f"got {r.status_code}")

    # 上传图片
    section("3. 图片上传")
    img_path = os.path.join(tempfile.gettempdir(), "smoke_upload.png")
    Image.new("RGB", (600, 400), (59, 130, 246)).save(img_path)
    with open(img_path, "rb") as fh:
        r = req("POST", "/api/upload", token=seller_tok, files={"file": ("smoke_upload.png", fh, "image/png")})
    check("POST /api/upload -> 200", r.status_code == 200, r.text[:200])
    up = r.json() if r.status_code == 200 else {}
    check("上传返回 /uploads 地址", str(up.get("url", "")).startswith("/uploads/"), str(up))
    img_url = up.get("url")
    if img_url:
        rr = httpx.get(BASE + img_url, timeout=10)
        check("上传后的图片可访问", rr.status_code == 200, f"got {rr.status_code}")

    with open(img_path, "rb") as fh:
        r = req("POST", "/api/upload", files={"file": ("x.png", fh, "image/png")})
    check("未登录上传 -> 401", r.status_code == 401, f"got {r.status_code}")

    # 发布商品
    section("4. 发布 / 编辑 / 下架商品")
    payload = {
        "title": "【冒烟测试】全新机械键盘",
        "description": "全键无冲，青轴，用了不到一个月，因为换静音轴出掉。",
        "price": 199.5,
        "original_price": 399.0,
        "category_id": cat_id,
        "condition_level": 2,
        "trade_place": "三食堂门口",
        "images": [img_url] if img_url else [],
    }
    r = req("POST", "/api/products", token=seller_tok, json=payload)
    check("发布商品 -> 200/201", r.status_code in (200, 201), r.text[:300])
    pid = r.json().get("id")
    check("新商品 id 有效", bool(pid), str(r.json())[:200])
    r = req("GET", f"/api/products/{pid}")
    check("新商品状态 on_sale", r.json().get("status") == "on_sale", str(r.json().get("status")))

    r = req("POST", "/api/products", json=payload)
    check("未登录发布 -> 401", r.status_code == 401, f"got {r.status_code}")

    r = req("POST", "/api/products", token=seller_tok, json={**payload, "price": -5})
    check("负数价格 -> 422", r.status_code == 422, f"got {r.status_code}")

    r = req("PUT", f"/api/products/{pid}", token=seller_tok, json={**payload, "title": "【冒烟测试】全新机械键盘（已改价）", "price": 179.0})
    check("编辑自己的商品 -> 200", r.status_code == 200, r.text[:200])

    r = req("PUT", f"/api/products/{pid}", token=outsider_tok, json={**payload, "title": "被别人改了"})
    check("改别人的商品 -> 403/404", r.status_code in (403, 404), f"got {r.status_code}")

    r = req("GET", "/api/products/mine", token=seller_tok)
    mine = r.json()
    check("GET /products/mine -> 200", r.status_code == 200, r.text[:200])
    check("我的商品列表含新商品", any(p["id"] == pid for p in mine.get("items", [])), str([p["id"] for p in mine.get("items", [])])[:200])

    r = req("GET", "/api/products?keyword=机械键盘&sort=price_asc")
    check("关键词搜索有结果", r.status_code == 200 and r.json()["total"] >= 1, r.text[:200])

    r = req("GET", "/api/products?min_price=100&max_price=200")
    check("价格区间筛选可用", r.status_code == 200, r.text[:200])

    r = req("GET", "/api/products?seller_id=%d" % seller["id"])
    check("按卖家筛选可用", r.status_code == 200 and r.json()["total"] >= 1, r.text[:200])

    # 收藏
    section("5. 收藏")
    r = req("POST", f"/api/products/{pid}/favorite", token=buyer_tok)
    check("收藏商品 -> 200", r.status_code == 200, r.text[:200])
    check("返回 favorited=true", r.json().get("favorited") is True, r.text[:200])
    fav_count_1 = r.json().get("favorite_count")

    r = req("GET", "/api/favorites", token=buyer_tok)
    check("GET /favorites -> 200", r.status_code == 200, r.text[:200])
    check("收藏列表含该商品", any(p["id"] == pid for p in r.json().get("items", [])), r.text[:300])

    r = req("POST", f"/api/products/{pid}/favorite", token=buyer_tok)
    check("再次点击取消收藏", r.json().get("favorited") is False, r.text[:200])
    check("收藏数回落", r.json().get("favorite_count") == (fav_count_1 or 0) - 1, r.text[:200])
    req("POST", f"/api/products/{pid}/favorite", token=buyer_tok)

    # 订单
    section("6. 订单全流程")
    r = req("POST", "/api/orders", token=seller_tok, json={"product_id": pid})
    check("买自己的商品 -> 400", r.status_code == 400, f"got {r.status_code}")

    r = req("POST", "/api/orders", token=buyer_tok, json={
        "product_id": pid, "trade_place": "三食堂门口", "trade_time": "2026-03-01 12:30", "remark": "冒烟测试下单",
    })
    check("下单 -> 200/201", r.status_code in (200, 201), r.text[:300])
    order = r.json()
    oid = order.get("id") or order.get("order", {}).get("id")
    check("返回订单号", bool(order.get("order_no")), str(order)[:200])

    r = req("GET", f"/api/products/{pid}")
    check("下单后商品变 reserved", r.json().get("status") == "reserved", str(r.json().get("status")))

    r = req("POST", "/api/orders", token=outsider_tok, json={"product_id": pid})
    check("已被预订的商品不能重复下单 -> 400", r.status_code == 400, f"got {r.status_code}")

    r = req("GET", "/api/orders/summary", token=buyer_tok)
    check("买家订单汇总 -> 200", r.status_code == 200, r.text[:200])
    check("汇总含 buyer/seller/pending_action", {"buyer", "seller", "pending_action"} <= set(r.json()), str(list(r.json())))

    r = req("GET", "/api/orders?role=buyer", token=buyer_tok)
    check("买家订单列表 -> 200", r.status_code == 200, r.text[:200])
    check("列表含新订单", any(o["id"] == oid for o in r.json().get("items", [])), str([o["id"] for o in r.json().get("items", [])])[:200])

    r = req("GET", f"/api/orders/{oid}", token=outsider_tok)
    check("非参与者看订单 -> 403", r.status_code == 403, f"got {r.status_code}")

    r = req("GET", f"/api/orders/{oid}", token=seller_tok)
    check("卖家看订单 -> 200 且 my_role=seller", r.status_code == 200 and r.json().get("my_role") == "seller", r.text[:200])

    r = req("GET", f"/api/orders/{oid}", token=admin_tok)
    check("管理员可查看任意订单", r.status_code == 200, r.text[:200])

    r = req("POST", f"/api/orders/{oid}/action", token=buyer_tok, json={"action": "accept"})
    check("买家不能接单 -> 403", r.status_code == 403, f"got {r.status_code}")

    r = req("POST", f"/api/orders/{oid}/action", token=seller_tok, json={"action": "accept"})
    check("卖家接单 -> 200", r.status_code == 200, r.text[:200])

    r = req("POST", f"/api/orders/{oid}/action", token=buyer_tok, json={"action": "complete"})
    check("买家确认完成 -> 200", r.status_code == 200, r.text[:200])

    r = req("GET", f"/api/orders/{oid}", token=buyer_tok)
    check("订单状态 completed", r.json().get("status") == "completed", r.text[:200])

    r = req("GET", f"/api/products/{pid}")
    check("完成后商品变 sold", r.json().get("status") == "sold", str(r.json().get("status")))

    r = req("POST", f"/api/orders/{oid}/review", token=buyer_tok, json={"rating": 5, "content": "卖家很好说话，键盘成色如描述！"})
    check("买家评价 -> 200/201", r.status_code in (200, 201), r.text[:300])

    r = req("POST", f"/api/orders/{oid}/review", token=buyer_tok, json={"rating": 4, "content": "重复评价"})
    check("重复评价 -> 400/409", r.status_code in (400, 409), f"got {r.status_code}")

    r = req("POST", f"/api/orders/{oid}/review", token=outsider_tok, json={"rating": 5})
    check("非参与者评价 -> 403", r.status_code == 403, f"got {r.status_code}")

    r = req("GET", f"/api/users/{seller['id']}/reviews")
    check("卖家评价列表有数据", r.status_code == 200 and r.json()["total"] >= 1, r.text[:200])

    # 取消流程（再发一件商品验证）
    r = req("POST", "/api/products", token=seller_tok, json={**payload, "title": "【冒烟测试】可取消的商品", "price": 20.0})
    cancel_pid = r.json().get("id")
    r = req("POST", "/api/orders", token=buyer_tok, json={"product_id": cancel_pid})
    cancel_oid = r.json().get("id") or r.json().get("order", {}).get("id")
    r = req("POST", f"/api/orders/{cancel_oid}/action", token=buyer_tok, json={"action": "cancel", "reason": "冒烟测试：改主意了"})
    check("买家取消订单 -> 200", r.status_code == 200, r.text[:200])
    r = req("GET", f"/api/orders/{cancel_oid}", token=buyer_tok)
    check("取消后状态 cancelled", r.json().get("status") == "cancelled", r.text[:200])
    r = req("GET", f"/api/products/{cancel_pid}")
    check("取消后商品回到 on_sale", r.json().get("status") == "on_sale", str(r.json().get("status")))

    # 消息
    section("7. 站内消息")
    r = req("POST", "/api/messages", token=buyer_tok, json={
        "to_user_id": seller["id"], "product_id": pid, "content": "你好，键盘还在吗？",
    })
    check("发送消息 -> 200/201", r.status_code in (200, 201), r.text[:300])

    r = req("POST", "/api/messages", token=buyer_tok, json={"to_user_id": buyer["id"], "content": "自言自语"})
    check("不能给自己发消息 -> 400", r.status_code == 400, f"got {r.status_code}")

    r = req("GET", "/api/messages/conversations", token=seller_tok)
    check("会话列表 -> 200", r.status_code == 200, r.text[:200])
    check("会话含买家", any(c["peer_id"] == buyer["id"] for c in r.json().get("items", [])), r.text[:300])

    r = req("GET", "/api/messages/unread-count", token=seller_tok)
    check("未读数 -> 200", r.status_code == 200 and "unread" in r.json(), r.text[:200])

    unread_before = r.json()["unread"]
    r = req("GET", f"/api/messages/thread?peer_id={buyer['id']}", token=seller_tok)
    check("会话详情 -> 200", r.status_code == 200, r.text[:200])
    check("会话详情含 peer/items", {"peer", "items"} <= set(r.json()), str(list(r.json())))
    check("会话里能读到那条消息", any("键盘还在吗" in m["content"] for m in r.json().get("items", [])), r.text[:300])

    r = req("GET", "/api/messages/unread-count", token=seller_tok)
    check("读过之后未读数减少", r.json()["unread"] < unread_before, f"{unread_before} -> {r.json()['unread']}")

    # 用户主页
    section("8. 用户主页")
    r = req("GET", f"/api/users/{seller['id']}")
    check("用户主页 -> 200", r.status_code == 200, r.text[:200])
    check("含 stats", {"on_sale", "sold", "reviews"} <= set(r.json().get("stats", {})), str(r.json().get("stats")))
    check("主页不含 password_hash", "password_hash" not in r.text)
    check("主页含 rating_avg", "rating_avg" in r.json())

    r = req("GET", f"/api/users/{seller['id']}/products")
    check("用户商品列表 -> 200", r.status_code == 200, r.text[:200])

    r = req("GET", "/api/users/999999")
    check("不存在的用户 -> 404", r.status_code == 404, f"got {r.status_code}")

    # 后台
    section("9. 管理后台")
    r = req("GET", "/api/admin/stats", token=admin_tok)
    check("后台概览 -> 200", r.status_code == 200, r.text[:200])
    stats = r.json()
    check("概览字段齐全", {"overview", "trend", "category_rank", "top_sellers", "recent_orders"} <= set(stats), str(list(stats)))
    check("overview 含 gmv/users/products/orders", {"gmv", "users", "products", "orders", "products_on_sale", "orders_completed"} <= set(stats["overview"]), str(list(stats["overview"])))
    check("trend 有 7 天", len(stats["trend"]) == 7, str(len(stats["trend"])))

    r = req("GET", "/api/admin/stats", token=seller_tok)
    check("普通用户访问后台 -> 403", r.status_code == 403, f"got {r.status_code}")

    r = req("GET", "/api/admin/stats")
    check("未登录访问后台 -> 401", r.status_code == 401, f"got {r.status_code}")

    r = req("GET", "/api/admin/users?page=1&size=5", token=admin_tok)
    check("后台用户列表 -> 200", r.status_code == 200, r.text[:200])
    check("用户列表含统计列", r.json()["items"] and "product_count" in r.json()["items"][0])
    check("用户列表含 rating_avg", r.json()["items"] and "rating_avg" in r.json()["items"][0])

    r = req("GET", "/api/admin/products?page=1&size=5", token=admin_tok)
    check("后台商品列表 -> 200", r.status_code == 200, r.text[:200])

    r = req("GET", "/api/admin/orders?page=1&size=5", token=admin_tok)
    check("后台订单列表 -> 200", r.status_code == 200, r.text[:200])

    r = req("POST", f"/api/admin/users/{outsider['id']}/status", token=admin_tok, json={"status": 0})
    check("禁用用户 -> 200", r.status_code == 200, r.text[:200])
    r = req("POST", "/api/auth/login", json={"username": "chenjie", "password": "123456"})
    check("被禁用用户登录被拒 -> 403", r.status_code == 403, f"got {r.status_code}")
    req("POST", f"/api/admin/users/{outsider['id']}/status", token=admin_tok, json={"status": 1})
    r = req("POST", "/api/auth/login", json={"username": "chenjie", "password": "123456"})
    check("恢复后可以登录", r.status_code == 200, f"got {r.status_code}")

    r = req("POST", "/api/admin/users/1/status", token=admin_tok, json={"status": 0})
    check("不能禁用管理员 -> 400", r.status_code == 400, f"got {r.status_code}")

    # 静态页面
    section("10. 前端静态资源")
    for path, label in [("/", "首页 /"), ("/index.html", "index.html"),
                        ("/product.html", "product.html"), ("/publish.html", "publish.html"),
                        ("/login.html", "login.html"), ("/register.html", "register.html"),
                        ("/me.html", "me.html"), ("/messages.html", "messages.html"),
                        ("/user.html", "user.html"), ("/admin.html", "admin.html"),
                        ("/assets/css/style.css", "style.css"),
                        ("/assets/js/api.js", "api.js"), ("/assets/js/common.js", "common.js"),
                        ("/assets/js/home.js", "home.js"), ("/assets/js/auth.js", "auth.js"),
                        ("/assets/js/product.js", "product.js"), ("/assets/js/publish.js", "publish.js"),
                        ("/assets/js/me.js", "me.js"), ("/assets/js/messages.js", "messages.js"),
                        ("/assets/js/user.js", "user.js"), ("/assets/js/admin.js", "admin.js"),
                        ("/assets/js/order.js", "order.js")]:
        rr = httpx.get(BASE + path, timeout=10)
        check(f"静态资源 {label} -> 200", rr.status_code == 200, f"got {rr.status_code}")

    rr = httpx.get(BASE + "/index.html", timeout=10)
    check("首页是 HTML", "text/html" in rr.headers.get("content-type", ""), rr.headers.get("content-type", ""))

    # 登出
    section("11. 登出")
    r = req("POST", "/api/auth/logout", token=buyer_tok)
    check("登出 -> 200", r.status_code == 200, r.text[:200])

    # -------------------------------------------------- 前端 JS 语法自检
    # 上面的「静态资源 -> 200」只能证明文件在，抓不到语法错误。
    # 而 common.js 是所有页面都 import 的公共模块：它一旦语法错误，
    # 整站 JS 全部不执行、页面白屏，但资源仍然返回 200。必须真的解析一遍。
    section("12. 前端 JS 模块语法")
    node = shutil.which("node") or next(
        (p for p in [os.path.expandvars(r"%APPDATA%\dsh-tauri\runtime\node.exe"),
                     r"C:\Program Files\nodejs\node.exe"]
         if os.path.exists(p)), None)
    if not node:
        print("  [SKIP] 未找到 node，跳过（不影响后端结论）")
    else:
        js_dir = Path(__file__).resolve().parents[2] / "frontend" / "assets" / "js"
        files = sorted(js_dir.glob("*.js"))
        check("找到前端 JS 模块", len(files) >= 10, f"只找到 {len(files)} 个")
        with tempfile.TemporaryDirectory() as tmp:
            ok_all = True
            for src in files:
                # node --check 按扩展名判断模块类型，先复制成 .mjs 才会按 ESM 解析
                dst = Path(tmp) / (src.stem + ".mjs")
                dst.write_bytes(src.read_bytes())
                try:
                    proc = subprocess.run([node, "--check", str(dst)],
                                          capture_output=True, text=True, timeout=30)
                    err = (proc.stderr or "").strip().splitlines()
                    bad = proc.returncode != 0
                except Exception as exc:  # noqa: BLE001
                    print(f"  [SKIP] 无法运行 node：{exc}")
                    bad = False
                    ok_all = False
                if bad:
                    ok_all = False
                    first = err[0] if err else "?"
                    line = next((e for e in err if "SyntaxError" in e), first)
                    check(f"语法 {src.name}", False, line[:160])
            if ok_all:
                check(f"全部 {len(files)} 个 JS 模块语法正确", True)

    # -------------------------------------------------- 多图与图片顺序
    section("13. 多图上传与顺序持久化")
    multi = []
    for idx in range(3):
        p = os.path.join(tempfile.gettempdir(), f"smoke_multi_{idx}.png")
        Image.new("RGB", (300, 200), (40 + 60 * idx, 120, 220 - 40 * idx)).save(p)
        with open(p, "rb") as fh:
            r = req("POST", "/api/upload", token=seller_tok,
                    files={"file": (f"m{idx}.png", fh, "image/png")})
        if r.status_code == 200:
            multi.append(r.json().get("url"))
    check("可连续上传 3 张图", len(multi) == 3, str(multi))

    multi_payload = {**payload, "title": "【冒烟测试】三张图顺序", "images": multi}
    r = req("POST", "/api/products", token=seller_tok, json=multi_payload)
    mid = r.json().get("id")
    check("发布多图商品 -> 200", r.status_code in (200, 201) and bool(mid), r.text[:200])

    r = req("GET", f"/api/products/{mid}")
    got = r.json()
    check("详情返回 3 张图", len(got.get("images") or []) == 3, str(got.get("images")))
    check("图片顺序 = 上传顺序", got.get("images") == multi, str(got.get("images")))
    check("封面 = 第一张图", got.get("cover") == multi[0], str(got.get("cover")))

    # 模拟前端拖拽排序后提交：把第三张拖到最前
    shuffled = [multi[2], multi[0], multi[1]]
    r = req("PUT", f"/api/products/{mid}", token=seller_tok, json={**multi_payload, "images": shuffled})
    check("重排图片后保存 -> 200", r.status_code == 200, r.text[:200])
    r = req("GET", f"/api/products/{mid}")
    got2 = r.json()
    check("重排后的顺序已持久化（非按 id 返回）", got2.get("images") == shuffled, str(got2.get("images")))
    check("封面跟随新顺序", got2.get("cover") == shuffled[0], str(got2.get("cover")))

    # 删到只剩一张
    r = req("PUT", f"/api/products/{mid}", token=seller_tok, json={**multi_payload, "images": [shuffled[1]]})
    check("删到只剩一张 -> 200", r.status_code == 200, r.text[:200])
    r = req("GET", f"/api/products/{mid}")
    check("只剩一张时列表正确", r.json().get("images") == [shuffled[1]], str(r.json().get("images")))
    r = req("PUT", f"/api/products/{mid}", token=seller_tok, json={**multi_payload, "images": []})
    check("清空图片 -> 400/422", r.status_code in (400, 422), f"got {r.status_code}")
    req("DELETE", f"/api/products/{mid}", token=seller_tok)

    # -------------------------------------------------- 同校区优先
    section("14. 同校区优先排序")
    my_campus = seller.get("campus")
    check("当前账号有校区", bool(my_campus), str(my_campus))

    def fetch(**q):
        return req("GET", "/api/products", token=seller_tok,
                   params={"status": "active", "size": 60, **q})

    base = fetch()
    check("默认列表 -> 200", base.status_code == 200, base.text[:200])
    base_items = base.json().get("items") or []
    check("列表带 seller_campus", bool(base_items) and "seller_campus" in base_items[0], str(base_items[:1]))
    base_total = base.json().get("total")

    cf = fetch(campus_first=1)
    check("campus_first=1 -> 200", cf.status_code == 200, cf.text[:200])
    cf_items = cf.json().get("items") or []
    check("总数不受排序影响", cf.json().get("total") == base_total,
          f"{cf.json().get('total')} vs {base_total}")

    same = [p.get("seller_campus") == my_campus for p in cf_items]
    check("同校商品全部排在前面", same == sorted(same, reverse=True),
          "".join("1" if s else "0" for s in same))
    check("确实存在同校商品", any(same), f"{sum(same)}/{len(same)}")
    check("存在异校商品（排序有可观察效果）", not all(same), f"{sum(same)}/{len(same)}")

    # 与价格升序叠加：先按校区分组，组内价格升序
    cfp = (fetch(campus_first=1, sort="price_asc").json().get("items") or [])
    prices_ok, seen_other, prev = True, False, None
    for p in cfp:
        if p.get("seller_campus") == my_campus:
            if seen_other or (prev is not None and float(p["price"]) < prev):
                prices_ok = False
            prev = float(p["price"])
        else:
            seen_other, prev = True, None
    check("同校优先 + 价格升序可叠加", prices_ok,
          str([(p.get("seller_campus"), p.get("price")) for p in cfp])[:240])

    # 默认不传该参数时不应改变原有排序（第一条按时间最新）
    check("campus_first 默认关闭", fetch().json().get("items") == base_items)

    # 未登录时是空操作，不能报错
    r = req("GET", "/api/products?campus_first=1&size=5")
    check("未登录带 campus_first -> 200", r.status_code == 200, r.text[:200])
    check("未登录时不改变总数", r.json().get("total") == base_total, r.text[:200])

    r = req("GET", "/api/products?campus_first=maybe")
    check("campus_first 非法值 -> 422", r.status_code == 422, f"got {r.status_code}")

    # -------------------------------------------------- 拖拽排序的下标算法
    # 「拖到悬停项的左边还是右边」最容易出现差一错误，而它在浏览器里没法自动测。
    # publish.js 已把这段算法抽到 order.js 的纯函数里（不碰 DOM），这里直接
    # 用 node 加载**真正被前端引用的那个文件**来跑用例。
    section("15. 拖拽排序下标算法（order.js 单测）")
    order_js = Path(__file__).resolve().parents[2] / "frontend" / "assets" / "js" / "order.js"
    if not check("order.js 存在", order_js.exists(), str(order_js)):
        pass
    elif not node:
        print("  [SKIP] 未找到 node，跳过（不影响后端结论）")
    else:
        js = r'''
import { moveItem, dropIndex } from "__URI__";
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const bad = [];
const t = (name, from, over, after, want) => {
  const l = ["a", "b", "c", "d"];
  const to = dropIndex(from, over, after);
  moveItem(l, from, to);
  if (!eq(l, want)) bad.push(name + ": 得到 " + JSON.stringify(l) + "，应为 " + JSON.stringify(want));
};
t("拖第1张到第3张右半边(落末尾)", 0, 2, true, ["b", "c", "a", "d"]);
t("拖第4张到第1张左半边(落最前=封面)", 3, 0, false, ["d", "a", "b", "c"]);
t("往后挪一格(拖2到3右半边)", 1, 2, true, ["a", "c", "b", "d"]);
t("往前挪一格(拖3到2左半边)", 2, 1, false, ["a", "c", "b", "d"]);
t("拖到最末尾", 0, 3, true, ["b", "c", "d", "a"]);
t("原地放下不变", 1, 1, false, ["a", "b", "c", "d"]);
t("落在下一张左半边=原位不变", 1, 2, false, ["a", "b", "c", "d"]);
t("拖到自己右半边不变", 1, 0, true, ["a", "b", "c", "d"]);
t("拖到自己左半边不变", 0, 1, false, ["a", "b", "c", "d"]);
if (moveItem(["a"], 0, 5)) bad.push("越界应返回 false");
if (moveItem(["a"], 0, 0)) bad.push("原地应返回 false");
if (moveItem([], 0, 0)) bad.push("空数组应返回 false");
console.log(bad.length ? "BAD " + bad.join(" | ") : "OK");
'''.replace("__URI__", order_js.as_uri())
        try:
            proc = subprocess.run([node, "--input-type=module", "-e", js],
                                  capture_output=True, text=True, encoding="utf-8",
                                  errors="replace", timeout=60)
            out = (proc.stdout or "").strip()
            detail = out or ((proc.stderr or "").strip()[-220:])
            check("落点下标算法 12 个用例全部正确", proc.returncode == 0 and out.endswith("OK"),
                  detail[:220])
        except Exception as exc:  # noqa: BLE001
            check("落点下标算法 12 个用例全部正确", False, f"无法运行 node：{exc}")

    # ---------------------------------------------------------------- 汇总
    print("\n" + "=" * 62)
    print(f"通过 {len(PASSED)} 项，失败 {len(FAILED)} 项")
    if FAILED:
        print("\n失败明细：")
        for item in FAILED:
            print("  - " + item)
    print("=" * 62)
    return 0 if not FAILED else 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:  # noqa: BLE001
        traceback.print_exc()
        sys.exit(3)

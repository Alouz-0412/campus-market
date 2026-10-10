"""建库建表 + 灌入演示数据。

    python backend/scripts/init_db.py            # 重建所有表（会清空数据）
    python backend/scripts/init_db.py --no-seed  # 只建表，不灌数据

警告：会 DROP 掉同名表，仅用于开发环境。
"""

from __future__ import annotations

import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import pymysql  # noqa: E402
from pymysql.constants import CLIENT  # noqa: E402

from app.config import settings  # noqa: E402
from app.security import hash_password  # noqa: E402


def connect(database: str | None = None):
    kwargs = settings.db_kwargs.copy()
    kwargs["database"] = database
    kwargs["autocommit"] = False
    return pymysql.connect(charset="utf8mb4", **kwargs)


def run_schema() -> None:
    sql_file = settings.SQL_DIR / "schema.sql"
    if not sql_file.is_file():
        raise SystemExit(f"找不到建表脚本：{sql_file}")
    statements = sql_file.read_text(encoding="utf-8")

    conn = pymysql.connect(
        charset="utf8mb4",
        autocommit=True,
        client_flag=CLIENT.MULTI_STATEMENTS,
        host=settings.DB_HOST,
        port=settings.DB_PORT,
        user=settings.DB_USER,
        password=settings.DB_PASSWORD,
    )
    try:
        with conn.cursor() as cur:
            cur.execute(statements)
            while cur.nextset():
                pass
    finally:
        conn.close()
    print(f"[1/2] 结构已重建：{sql_file.name} -> {settings.DB_NAME}")


# ---------------------------------------------------------------- 演示数据 ----

CATEGORIES = [
    ("教材书籍", "📚", 10),
    ("数码电子", "💻", 20),
    ("生活用品", "🧴", 30),
    ("运动户外", "🏀", 40),
    ("服饰鞋包", "👟", 50),
    ("美妆个护", "💄", 60),
    ("乐器文创", "🎸", 70),
    ("代步出行", "🚲", 80),
    ("票券卡类", "🎫", 90),
    ("其他", "📦", 100),
]

USERS = [
    # username, password, nickname, campus, bio, role, email
    ("admin", "admin123", "平台管理员", "信息中心", "负责维护交易秩序", "admin", "admin@campus.edu"),
    ("xiaoming", "123456", "小明同学", "计算机学院", "计算机大三，出闲置回血", "user", "xiaoming@campus.edu"),
    ("lihua", "123456", "李华", "外国语学院", "英语系，爱看书", "user", "lihua@campus.edu"),
    ("zhangwei", "123456", "张伟", "机械工程学院", "实验室搬砖中", "user", "zhangwei@campus.edu"),
    ("wangfang", "123456", "王芳", "艺术学院", "美术生，出画材", "user", "wangfang@campus.edu"),
    ("chenjie", "123456", "陈杰", "经济管理学院", "考研上岸，资料全出", "user", "chenjie@campus.edu"),
]

# seller_idx 指向 USERS 下标
PRODUCTS = [
    # title, category_idx(1-based), price, original, cond, place, desc, status, seller_idx
    ("《数据结构与算法分析》C语言版 第二版", 1, 25.00, 59.00, 2, "三号教学楼门口",
     "正版书，只翻过前半本，无笔记无划线。配套课后答案打印稿一起送。", "on_sale", 1),
    ("考研数学 张宇1000题（2026版）全套", 1, 45.00, 89.00, 2, "图书馆一楼大厅",
     "题目册+解析册，只做了前 3 章，其余全新。已上岸，低价出给学弟学妹。", "on_sale", 5),
    ("iPad Air 5 64G 深空灰 + 妙控键盘", 2, 2680.00, 4799.00, 3, "东门星巴克",
     "自用一年，屏幕无划痕，电池健康 94%。附赠原装妙控键盘和笔尖。可当面验机。", "on_sale", 1),
    ("罗技 MX Master 3S 无线鼠标", 2, 320.00, 699.00, 2, "宿舍楼 6 栋楼下",
     "去年双十一买的，用了两个月就换成轨迹球了，功能完好，配件齐全。", "on_sale", 3),
    ("小米台灯 Pro 护眼版", 3, 89.00, 199.00, 2, "四号宿舍楼下",
     "毕业出闲置，无频闪，亮度色温都可调，宿舍写作业神器。", "on_sale", 2),
    ("飞利浦电动牙刷 HX3216（全新未拆）", 3, 79.00, 169.00, 1, "南门快递站",
     "朋友送的重了，全新未拆封，包装盒有点压痕但里面完好。", "on_sale", 4),
    ("迪卡侬篮球 7 号标准球", 4, 45.00, 99.00, 3, "西区篮球场",
     "打了一学期，气密性正常，表皮有使用痕迹，不影响手感。", "on_sale", 3),
    ("尤尼克斯羽毛球拍 NF-800", 4, 420.00, 780.00, 2, "体育馆羽毛球场",
     "打了不到 10 次，拍面无磕碰，拉线还是原厂的，送手胶两条。", "on_sale", 5),
    ("Nike Air Force 1 白色 42 码", 5, 260.00, 799.00, 3, "东苑食堂门口",
     "穿了半年，鞋底有磨损，已清洗干净。码数偏小建议 41 码脚入。", "on_sale", 4),
    ("JK 制服一套（上衣+裙子）M 码", 5, 95.00, 260.00, 2, "艺术楼楼下",
     "只穿过两次拍照，尺码不合身，已洗熨好。", "on_sale", 5),
    ("雅诗兰黛小棕瓶 50ml（专柜正品）", 6, 320.00, 760.00, 2, "南门地铁站 A 口",
     "专柜购买有小票，用了大概五分之一，剩余量充足。", "on_sale", 5),
    ("雅马哈 F310 民谣吉他 41 寸", 7, 480.00, 899.00, 2, "艺术楼琴房",
     "大一买的，琴颈无变形，音准稳定，送琴包+变调夹+备用弦。", "on_sale", 5),
    ("捷安特 ATX 660 山地车（含锁）", 8, 620.00, 1580.00, 3, "北门车棚",
     "骑了两年，刚换过链条和刹车皮，车况良好，带 U 型锁和车灯。", "on_sale", 2),
    ("校园一卡通（已毕业，余额 37 元）", 9, 30.00, 0.00, 3, "食堂一楼",
     "毕业了用不上，卡内余额 37 元，只出给同校同学。", "on_sale", 3),
    ("人体工学椅 电脑椅（含腰靠）", 10, 260.00, 599.00, 3, "五号宿舍楼下自提",
     "考研结束出，坐了一年半，气杆正常不塌陷，需自行搬运。", "on_sale", 5),
    ("《线性代数应该这样学》第三版", 1, 22.00, 49.00, 1, "图书馆二楼",
     "全新未拆，买重了一本。", "sold", 2),
]


def seed(conn) -> None:
    with conn.cursor() as cur:
        # 分类
        cur.executemany(
            "INSERT INTO categories (name, icon, sort) VALUES (%s, %s, %s)", CATEGORIES
        )
        cur.execute("SELECT id FROM categories ORDER BY sort ASC, id ASC")
        category_ids = [r[0] for r in cur.fetchall()]

        # 用户
        user_ids = []
        for username, password, nickname, campus, bio, role, email in USERS:
            cur.execute(
                """INSERT INTO users (username, password_hash, nickname, campus, bio, role, email)
                   VALUES (%s, %s, %s, %s, %s, %s, %s)""",
                (username, hash_password(password), nickname, campus, bio, role, email),
            )
            user_ids.append(cur.lastrowid)

        # 商品
        product_ids = []
        for idx, (
            title, cat_idx, price, original, cond, place, desc, status, seller_idx
        ) in enumerate(PRODUCTS):
            cur.execute(
                """INSERT INTO products
                     (seller_id, category_id, title, description, price, original_price,
                      condition_level, trade_place, cover, status, view_count, created_at)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, NULL, %s, %s,
                           NOW() - INTERVAL %s DAY)""",
                (
                    user_ids[seller_idx],
                    category_ids[cat_idx - 1],
                    title,
                    desc,
                    price,
                    original or None,
                    cond,
                    place,
                    status,
                    30 + (idx * 17) % 260,
                    len(PRODUCTS) - idx,
                ),
            )
            product_ids.append(cur.lastrowid)

        # 收藏
        fav_pairs = [(1, 2), (1, 3), (2, 0), (2, 8), (3, 1), (4, 0), (5, 10), (5, 12), (5, 3)]
        cur.executemany(
            "INSERT IGNORE INTO favorites (user_id, product_id) VALUES (%s, %s)",
            [(user_ids[u], product_ids[p]) for u, p in fav_pairs],
        )
        cur.execute(
            """UPDATE products p SET favorite_count =
                 (SELECT COUNT(*) FROM favorites f WHERE f.product_id = p.id)"""
        )

        # 订单：一笔已完成（商品下标 15 已售）、一笔待确认、一笔已接单
        cur.execute(
            """INSERT INTO orders
                 (order_no, product_id, buyer_id, seller_id, title_snapshot, cover_snapshot,
                  amount, trade_place, trade_time, remark, status,
                  accepted_at, completed_at, created_at)
               VALUES (%s, %s, %s, %s, %s, NULL, %s, %s, %s, %s, 'completed',
                       NOW() - INTERVAL 5 DAY, NOW() - INTERVAL 4 DAY, NOW() - INTERVAL 6 DAY)""",
            (
                "CM2026100109300011",
                product_ids[15],
                user_ids[1],
                user_ids[2],
                PRODUCTS[15][0],
                PRODUCTS[15][2],
                "图书馆一楼大厅",
                "上周三下午",
                "麻烦带一下书~",
            ),
        )
        completed_order = cur.lastrowid

        cur.execute(
            """INSERT INTO orders
                 (order_no, product_id, buyer_id, seller_id, title_snapshot, cover_snapshot,
                  amount, trade_place, trade_time, remark, status, created_at)
               VALUES (%s, %s, %s, %s, %s, NULL, %s, %s, %s, %s, 'pending', NOW() - INTERVAL 4 HOUR)""",
            (
                "CM2026100714050022",
                product_ids[2],
                user_ids[2],
                user_ids[1],
                PRODUCTS[2][0],
                PRODUCTS[2][2],
                "东门星巴克",
                "今晚 7 点",
                "可以当面验机吗？",
            ),
        )

        cur.execute(
            """INSERT INTO orders
                 (order_no, product_id, buyer_id, seller_id, title_snapshot, cover_snapshot,
                  amount, trade_place, trade_time, remark, status, accepted_at, created_at)
               VALUES (%s, %s, %s, %s, %s, NULL, %s, %s, %s, %s, 'accepted',
                       NOW() - INTERVAL 1 DAY, NOW() - INTERVAL 2 DAY)""",
            (
                "CM2026100618300033",
                product_ids[12],
                user_ids[3],
                user_ids[2],
                PRODUCTS[12][0],
                PRODUCTS[12][2],
                "北门车棚",
                "周六上午",
                "车锁是新的吗？",
            ),
        )

        # 评价（已完成订单双方互评）
        cur.execute(
            """INSERT INTO reviews (order_id, product_id, from_user_id, to_user_id, rating, content)
               VALUES (%s, %s, %s, %s, 5, %s)""",
            (completed_order, product_ids[15], user_ids[1], user_ids[2], "书和描述一致，卖家超好说话！"),
        )
        cur.execute(
            """INSERT INTO reviews (order_id, product_id, from_user_id, to_user_id, rating, content)
               VALUES (%s, %s, %s, %s, 5, %s)""",
            (completed_order, product_ids[15], user_ids[2], user_ids[1], "准时到，人很爽快，交易顺利。"),
        )
        cur.execute(
            """UPDATE users SET rating_sum = rating_sum + 5, rating_count = rating_count + 1
               WHERE id IN (%s, %s)""",
            (user_ids[1], user_ids[2]),
        )

        # 站内消息
        cur.execute(
            """INSERT INTO messages (from_user_id, to_user_id, product_id, content, is_read, created_at)
               VALUES (%s, %s, %s, %s, 1, NOW() - INTERVAL 5 HOUR)""",
            (user_ids[2], user_ids[1], product_ids[2], "你好，iPad 还在吗？"),
        )
        cur.execute(
            """INSERT INTO messages (from_user_id, to_user_id, product_id, content, is_read, created_at)
               VALUES (%s, %s, %s, %s, 1, NOW() - INTERVAL 4 HOUR)""",
            (user_ids[1], user_ids[2], product_ids[2], "在的，今晚东门可以看货。"),
        )
        cur.execute(
            """INSERT INTO messages (from_user_id, to_user_id, product_id, content, is_read, created_at)
               VALUES (%s, %s, %s, %s, 0, NOW() - INTERVAL 30 MINUTE)""",
            (user_ids[2], user_ids[1], product_ids[2], "好的，那我也把订单拍一下啦～"),
        )
        cur.execute(
            """INSERT INTO messages (from_user_id, to_user_id, product_id, content, is_read, created_at)
               VALUES (%s, %s, %s, %s, 0, NOW() - INTERVAL 20 MINUTE)""",
            (user_ids[3], user_ids[2], product_ids[12], "周六上午九点北门车棚见？"),
        )

    conn.commit()
    print(
        f"[2/2] 演示数据已写入：{len(USERS)} 个账号 / {len(PRODUCTS)} 件商品 / "
        f"{len(CATEGORIES)} 个分类 / 3 笔订单"
    )


def main() -> None:
    seed_enabled = "--no-seed" not in sys.argv
    print(f"目标数据库：{settings.DB_USER}@{settings.DB_HOST}:{settings.DB_PORT}/{settings.DB_NAME}")
    run_schema()

    conn = connect(settings.DB_NAME)
    try:
        if seed_enabled:
            seed(conn)
    finally:
        conn.close()

    print("\n完成。默认账号：")
    print("  管理员   admin    / admin123")
    print("  普通用户 xiaoming / 123456   （另有 lihua、zhangwei、wangfang、chenjie，密码同为 123456）")


if __name__ == "__main__":
    main()

# 校园二手交易平台

一个前后端一体、**零构建**的校园二手交易网站：FastAPI 提供 REST 接口并直接托管前端静态页，数据落在本机 MySQL，上传图片存本地磁盘。

- **后端**：FastAPI + PyMySQL（同步驱动）+ 自建轻量连接池，认证只用 Python 标准库（PBKDF2 口令 + HMAC 自签令牌）
- **前端**：原生 HTML / CSS / ES Module，无 npm、无打包、无框架
- **数据库**：MySQL 8.0，库名 `campus_market`，utf8mb4
- **接口文档**：服务起来后访问 `http://127.0.0.1:8000/docs`（FastAPI 自动生成）

---

## 一、快速开始

### 1. 准备环境

已在本机验证过的环境（其他机器按同版本准备即可）：

| 组件 | 版本 | 本机位置 |
| --- | --- | --- |
| Python | 3.10.10 | `D:\python\python.exe` |
| MySQL | 8.0.42（Windows 服务 `MySQL80`） | `D:\Mysql\Mysql8.0\bin\mysql.exe` |

Python 依赖（全部是纯 Python 包，不需要编译器）：

```bat
D:\python\python.exe -m pip install -r requirements.txt
```

> 本机已预装 fastapi / uvicorn / Pillow / python-multipart，只需补装 `pymysql`。

### 2. 确认数据库连接

配置在项目根目录的 `.env`：

```ini
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=你的MySQL密码
DB_NAME=campus_market
APP_HOST=127.0.0.1
APP_PORT=8000
SECRET_KEY=campus-market-dev-secret-change-me
TOKEN_EXPIRE_HOURS=168
MAX_UPLOAD_MB=8
```

改完 `.env` 需要重启服务。`.env` 不会被真实环境变量覆盖，所以临时也可以这样启动：

```bat
set DB_PASSWORD=别的密码 && D:\python\python.exe backend\run.py
```

### 3. 建库 + 灌演示数据

```bat
init_db.cmd
```

它会执行 `backend/sql/schema.sql`（**会先 DROP 掉这些表再重建**）并写入演示数据。等价的原始命令：

```bat
D:\python\python.exe backend\scripts\init_db.py
```

> 只给开发/演示用。生产环境不要跑，它会清空数据。

### 4. 启动

```bat
start.cmd
```

浏览器会自动打开 <http://127.0.0.1:8000/>。等价的原始命令：

```bat
D:\python\python.exe backend\run.py
```

### 5. 演示账号

| 角色 | 账号 | 密码 | 说明 |
| --- | --- | --- | --- |
| 管理员 | `admin` | `admin123` | 可进后台管理 |
| 普通用户 | `xiaoming` | `123456` | |
| 普通用户 | `lihua` | `123456` | |
| 普通用户 | `zhangwei` | `123456` | |
| 普通用户 | `wangfang` | `123456` | |
| 普通用户 | `chenjie` | `123456` | |

登录框**用户名或邮箱都可以**，页面上有「一键填充」的演示账号。

---

## 二、目录结构

```
campus-market/
├─ .env / .env.example          数据库与服务配置
├─ requirements.txt
├─ README.md
├─ init_db.cmd                  一键建库 + 灌数据
├─ start.cmd                    一键启动 + 打开浏览器
├─ test.cmd                     一键端到端冒烟测试
├─ backend/
│  ├─ run.py                    启动入口（等价 uvicorn app.main:app）
│  ├─ sql/schema.sql            建库建表 DDL（8 张表）
│  ├─ scripts/
│  │  ├─ init_db.py             执行 DDL + 写入演示数据
│  │  └─ smoke_test.py          端到端 HTTP 冒烟测试（160+ 条断言）
│  └─ app/
│     ├─ config.py              自写 .env 解析 + Settings 单例
│     ├─ db.py                  PyMySQL 连接池 + query/execute 助手
│     ├─ security.py            PBKDF2 口令 + HMAC-SHA256 自签令牌
│     ├─ deps.py                登录态依赖、public_user 脱敏
│     ├─ schemas.py             Pydantic 入参模型
│     ├─ utils.py               商品/订单装饰、标签字典、分页、订单号
│     ├─ main.py                组装路由、挂载静态资源、全局异常
│     └─ routers/
│        ├─ auth.py             注册/登录/登出/资料/改密
│        ├─ catalog.py          分类/商品/收藏/上传/公开统计
│        ├─ users.py            他人主页
│        ├─ orders.py           下单与订单状态机、评价
│        ├─ messages.py         站内会话
│        └─ admin.py            后台统计与管理
├─ frontend/                    纯静态，由后端托管
│  ├─ index.html                首页（搜索/筛选/排序/分页）
│  ├─ product.html              商品详情
│  ├─ publish.html              发布 / 编辑（二合一）
│  ├─ login.html  register.html 登录 / 注册
│  ├─ me.html                   个人中心（订单/我发布的/收藏/资料）
│  ├─ messages.html             站内消息
│  ├─ user.html                 他人主页
│  ├─ admin.html                后台管理
│  └─ assets/
│     ├─ css/style.css          全站唯一样式表
│     └─ js/ api.js common.js order.js home.js auth.js product.js
│           publish.js me.js messages.js user.js admin.js
└─ data/uploads/                上传的图片（运行时生成）
```

前端 JS 的分层：`api.js` 封装所有接口调用，`common.js` 提供工具函数与公共组件，其余文件是各页面逻辑；`order.js` 是唯一不含 DOM 逻辑的纯函数模块（拖拽排序的下标算法），因此能被 `smoke_test.py` 用 node 直接单测。页面用 `<script type="module">` 引入，**没有构建步骤**，改完刷新浏览器即生效。

---

## 三、功能清单

**游客**：浏览首页、按关键词/分类/价格区间/成色筛选、五种排序、看商品详情、看卖家主页与评价、看平台公开统计。

**买家**：注册登录、改资料与头像、搜索收藏、下单（可填面交地点/时间/留言）、取消订单、确认收货、评价卖家、和卖家站内聊天、订单汇总（待处理数量）。**登录后首页可开「🏫 同校区优先」**：同校卖家的商品排在最前，选择记在浏览器里、默认开着，也能用 URL 参数 `?campus_first=0` 关掉。

**卖家**：发布闲置（最多 9 图、**按住缩略图拖动即可调整顺序**、第一张就是封面、四级成色、原价对比）、编辑、手动下架/重新上架、删除、确认接单、完成交易、取消、评价买家。

**管理员**：平台概览（用户/商品/订单/GMV/消息/评价 六个指标）、近 7 天趋势柱状图、分类排行、热门卖家、最近订单、用户管理（禁用/启用）、商品管理（查看/删除）、订单管理（查看全量）。

**订单状态机**：

```
下单 ──► pending ──卖家接单──► accepted ──任一方完成──► completed（商品置 sold）
           │                      │
           └──────任一方取消───────┴──► cancelled（商品回到 on_sale）
```

商品在 `pending`/`accepted` 期间显示为「已被预订」（`reserved`），不能再被下单。接单/完成/取消都会自动给对方插入一条系统消息。不能买自己的商品、不能重复下单、非参与者看不到订单（403）、完成交易后双方各可评价一次。

---

## 四、数据库

库 `campus_market`（utf8mb4_unicode_ci、InnoDB），8 张表：

| 表 | 说明 | 关键约束 |
| --- | --- | --- |
| `users` | 用户 | `username`/`email` 唯一，`role` enum(user,admin)，`status` 1启用/0禁用，累计 `rating_sum`/`rating_count` |
| `categories` | 分类 | `name` 唯一，含 emoji 图标与排序 |
| `products` | 商品 | `condition_level` 1–4，`status` enum(on_sale,reserved,sold,off_shelf)，`is_deleted` 软删，浏览/收藏计数 |
| `product_images` | 商品图 | 一个商品多张，`sort` 定序，第 0 张为封面 |
| `favorites` | 收藏 | `(user_id, product_id)` 唯一 |
| `orders` | 订单 | `order_no` 唯一，含商品标题/封面快照，`status` enum(pending,accepted,completed,cancelled) |
| `messages` | 站内信 | `from_user_id`/`to_user_id`/`product_id`/`is_read` |
| `reviews` | 评价 | `(order_id, from_user_id)` 唯一，防止重复评价 |

除 `products.category_id` 外，外键均为 `ON DELETE CASCADE`。

---

## 五、接口一览

所有接口前缀 `/api`。需要登录的用 `Authorization: Bearer <token>`（登录/注册同时也会写一个 `cm_token` cookie，两种方式都认）。

### 认证 `/api/auth`

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/register` | 注册，返回 `{token, user}` |
| POST | `/login` | 登录（用户名或邮箱），返回 `{token, user}` |
| POST | `/logout` | 清 cookie |
| GET | `/me` | 当前用户 |
| PUT | `/me` | 改资料，返回脱敏后的用户 |
| PUT | `/me/password` | 改密码 |

### 商品 `/api`

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/categories` | 分类（含在售数量） |
| GET | `/stats` | 平台公开统计（首页横幅用，不需要登录） |
| GET | `/products` | 列表：`keyword, category_id, seller_id, status, condition_level, min_price, max_price, sort, campus_first, page, size` |
| GET | `/products/mine` | 我发布的（需登录） |
| GET | `/products/{id}` | 详情（含图片、卖家、是否已收藏；**会自增浏览量**） |
| POST | `/products` | 发布，返回 `{id, message}` |
| PUT | `/products/{id}` | 编辑（已售出不可编辑） |
| POST | `/products/{id}/status` | 改上下架，body `{status}` |
| DELETE | `/products/{id}` | 软删除 |
| POST | `/products/{id}/favorite` | 切换收藏，返回 `{favorited, favorite_count}` |
| GET | `/favorites` | 我的收藏 |
| POST | `/upload` | 上传图片，multipart 字段名 **`file`**，返回 `{url, filename}` |

`sort` 取值：`latest` / `price_asc` / `price_desc` / `popular` / `favorite`；`status` 取值：`active`（默认，含 on_sale+reserved）/ `on_sale` / `reserved` / `sold` / `off_shelf` / `all`。

`campus_first=1`（默认关）：**同校区优先**，需要在登录态下用，未登录或用户没填校区时等价于不传。实现方式是在 ORDER BY 最前面加一段 `CASE WHEN u.campus = %s THEN 0 ELSE 1 END ASC`，所以它能和任意 `sort` 叠加——同校商品内部仍然按 `sort` 排，异校商品内部也按 `sort` 排。列表里所有商品都带 `seller_campus` 字段，前端据此给同校商品加绿色描边与 `🏫 校区` 徽标。

### 用户 / 订单 / 消息 / 后台

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/users/{id}` | 公开资料 + 在售/已售/评价统计 |
| GET | `/api/users/{id}/products` | TA 的在售商品 |
| GET | `/api/users/{id}/reviews` | TA 收到的评价 |
| GET | `/api/orders/summary` | 买家/卖家各状态计数 + 待处理提示 |
| POST | `/api/orders` | 下单，body `{product_id, trade_place, trade_time, remark}` |
| GET | `/api/orders` | 订单列表：`role=all|buyer|seller`、`status`、分页 |
| GET | `/api/orders/{id}` | 详情（含双方评价、我在本次交易里的角色） |
| POST | `/api/orders/{id}/action` | `{action: accept|complete|cancel, reason}` |
| POST | `/api/orders/{id}/review` | `{rating: 1-5, content}` |
| GET | `/api/messages/conversations` | 会话列表（按最后消息时间倒序，含未读数） |
| GET | `/api/messages/unread-count` | `{unread}` |
| GET | `/api/messages/thread` | 与某人的消息：`peer_id`、可选 `product_id`、分页（**读取即标记已读**） |
| POST | `/api/messages` | 发消息 `{to_user_id, product_id?, content}` |
| POST | `/api/messages/read` | 手动标记已读，query `peer_id` |
| GET | `/api/admin/stats` | 后台概览 + 趋势 + 排行 + 最近订单 |
| GET | `/api/admin/users` | 用户管理（`keyword` 匹配用户名/昵称/校区） |
| POST | `/api/admin/users/{id}/status` | 禁用/启用 |
| GET | `/api/admin/products` | 商品管理 |
| DELETE | `/api/admin/products/{id}` | 删除商品 |
| GET | `/api/admin/orders` | 订单管理 |

后台所有接口都要求管理员，普通用户访问返回 403，未登录 401。

---

## 六、端到端验证

```bat
test.cmd
```

等价于 `D:\python\python.exe backend\scripts\smoke_test.py`，需要服务已经启动。它会真的发 HTTP 请求把整条业务链路跑一遍（约 160 条断言）：健康检查 → 认证（含重复注册、非法用户名、错误密码、改资料）→ 分类/列表分页排序筛选搜索 → 详情 → 图片上传 → 发布/编辑/越权/非法入参 → 收藏 → **订单全流程**（下单→商品变 reserved→卖家接单→买家完成→商品变 sold→评价→重复评价拦截；另一条下单→取消→商品回到 on_sale）→ 消息 → 用户主页 → 后台统计与管理 → 22 个前端静态资源 → 11 个前端 JS 模块的语法解析 → **多图上传与顺序持久化** → **同校区优先排序** → **拖拽落点下标算法的 node 单测** → 登出。

本机实测结果：**159 项全部通过，0 失败**（从空库重建后重跑同样全绿）。

第 13 节验证「多图顺序真的落库」：连传 3 张 → 发布时断言返回顺序等于上传顺序且第一张是封面 → 用 `[第3张, 第1张, 第2张]` 重排保存 → 断言读回来仍是这个顺序（证明它按 `product_images.sort` 而不是按自增 id 返回）且封面跟着变。

第 15 节是**唯一一节不碰 HTTP 的测试**：拖拽落点在浏览器里没法自动测，所以算法被抽进 `order.js` 的纯函数 `moveItem/dropIndex`，用 node `--input-type=module -e` 加载**前端真正引用的那个文件**，跑 12 个用例覆盖前后左右插入、原地放下、越界返回 false。这次它确实抓到了一处错误——不是代码错，是我把「把 b 拖到 c 的左半边」的期望值写错了（正确答案是 b 原地不动）。

---

## 七、踩过的坑（改动时注意）

- **不要直接调用带 `Query(...)` 默认值的 FastAPI 路由函数。** `my_products` 复用了 `list_products`，未显式传入的参数会保留 `Query(None)` 对象——它既不等于 `None` 又是真值，于是「最小价格」之类的过滤条件全部误命中，查询恒返回空。`catalog.py` 里的 `_plain()` 就是为这种情况兜底的：跨路由转发参数时先过一遍。
- **列表接口的 COUNT 语句必须剔除 `args[0]`。** 商品列表的 `_LIST_SELECT` 里带一个 `favorites` 联表的 viewer 占位符，订单列表里带 `reviewed_by_me` 的占位符，COUNT 语句并不包含它们；多传一个参数 PyMySQL 会直接抛 `not all arguments converted during string formatting`（表现为 500）。
- **`common.js` 是所有页面共同的依赖，它一旦语法错误整站白屏，但静态资源仍返回 200。** 所以冒烟测试第 12 节会用 `node --check` 真正解析每个 JS 模块（复制成 `.mjs` 才会按 ES Module 解析）。本次就靠它抓到过一处多余的右括号。
- **拖拽排序的两个「看着像 bug 其实是对的」语义**：把某张图拖到**相邻下一张的左半边**，结果就是它原地不动（因为它本来就在那张的前面）；拖到自己身上同理。只有落到右半边才往后走。`order.js` 的 `dropIndex(from, over, after)` 里那句 `if (from < to) to -= 1` 是必须的——先 `splice` 摘除会让后面的元素整体前移一格，不减就会多跳一位。
- **HTML5 的 `dragstart/dragover` 拖拽在触屏上不生效**，但触屏有浏览器另给的 `hover: none` 媒体查询：`publish.js` 检测到触屏会给每张图加 `‹`/`›` 两个微调按钮。同时，页面里原本就有「把文件拖进来上传」的 handler，内部排序的 dragover 必须用 `stopPropagation` 并且只处理 `dataTransfer.types` 含 `Files` 的情形，否则两种拖拽会互相点亮对方的高亮样式。
- **排查端口占用别用 `Get-NetTCPConnection -LocalPort 8000 -State Listen`**：本机实测它会漏报正在 LISTENING 的进程（返回空，可 `netstat` 明明有），结果新起的 uvicorn 报 `[Errno 10048] error while attempting to bind`，而健康检查恰好被那个旧进程响应了，很容易误判成"重启成功但改动没生效"。要用 `netstat -ano | Select-String ':8000'` 找到真正的 PID 再 `Stop-Process -Force`。
- **`run.py` 没有开 reload**，改了后端代码必须重启服务。
- **登录失败返回 400 而不是 401**（前端 `api.js` 遇到 401 会统一提示「登录已过期」，会把「密码错误」这种真实原因盖掉）。
- **上传图片存 `data/uploads/`**，`MAX_UPLOAD_MB` 默认 8 MB；图片会用 Pillow 把长边压到 1280，有透明通道存 PNG，否则存 JPEG（质量 86）。
- PowerShell 里看 Python 的中文输出要先 `$env:PYTHONIOENCODING='utf-8'; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8`，否则乱码。

---

## 八、可以继续做的方向

- 下单/新消息的实时推送（现在是轮询：会话列表 15s、当前会话 8s）
- 商品描述的富文本 / 视频
- 校区维度的更多玩法：只筛本校、按距离排序、跨校区面交点推荐
- 交易评价的关键词标签、卖家可信度评分
- 密码重置（现在只能改密码，没有找回）
- 生产部署：`uvicorn --workers`、Nginx 反代、把 `SECRET_KEY` 换成随机值、关掉 `/docs`

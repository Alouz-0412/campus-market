"""校园二手交易平台 —— FastAPI 入口。

启动：  python backend/run.py        （或见项目根目录 start.cmd）
API 文档：http://127.0.0.1:8000/docs
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from . import db
from .config import settings
from .routers import admin, auth, catalog, messages, orders, users

logger = logging.getLogger("campus-market")

DESCRIPTION = """
校园二手交易平台后端 API。

* 认证：注册 / 登录 / 令牌（HMAC 签名，无需额外依赖）
* 商品：发布、编辑、搜索、分类筛选、上下架
* 交易：下单 → 卖家接单 → 面交完成 / 取消 → 互评
* 消息：买卖双方围绕商品的站内沟通
* 后台：平台概览、用户管理、商品管理、订单总览
"""


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings.ensure_dirs()
    try:
        info = db.healthcheck()
        logger.info(
            "数据库连接正常：MySQL %s / %s（用户 %s，商品 %s）",
            info["version"],
            info["database"],
            info["users"],
            info["products"],
        )
    except Exception as exc:  # 不阻断启动，前端会看到明确提示
        logger.error("数据库连接失败：%s", exc)
        logger.error("请检查 .env 中的 DB_* 配置，并先运行 init_db.cmd 建库。")
    yield


app = FastAPI(
    title=settings.APP_TITLE,
    description=DESCRIPTION,
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.exception("未处理异常 %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": f"服务器内部错误：{exc}"})


@app.get("/api/health", tags=["系统"], summary="健康检查")
def health():
    try:
        info = db.healthcheck()
    except Exception as exc:
        return JSONResponse(status_code=503, content={"ok": False, "detail": str(exc)})
    return {"ok": True, **info}


# --- API 路由（必须先于静态目录注册）---
app.include_router(auth.router)
app.include_router(catalog.router)
app.include_router(users.router)
app.include_router(orders.router)
app.include_router(messages.router)
app.include_router(admin.router)

# --- 静态资源 ---
settings.ensure_dirs()
app.mount("/uploads", StaticFiles(directory=str(settings.UPLOAD_DIR)), name="uploads")

if settings.FRONTEND_DIR.is_dir():
    app.mount("/", StaticFiles(directory=str(settings.FRONTEND_DIR), html=True), name="frontend")
else:  # pragma: no cover
    logger.warning("前端目录不存在：%s", settings.FRONTEND_DIR)

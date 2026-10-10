"""MySQL 访问层：线程安全连接池 + 便捷查询函数。

PyMySQL 是同步驱动；FastAPI 里用普通 ``def`` 定义的路由会跑在线程池中，
因此这里用「信号量 + LIFO 空闲队列」实现一个够用的小连接池。
"""

from __future__ import annotations

import queue
import threading
from contextlib import contextmanager
from typing import Any, Iterable, Optional, Sequence

import pymysql
from pymysql.cursors import DictCursor

from .config import settings


class ConnectionPool:
    def __init__(self, size: int = 10, **conn_kwargs: Any) -> None:
        self._size = max(1, size)
        self._kwargs = conn_kwargs
        self._idle: "queue.LifoQueue[pymysql.connections.Connection]" = queue.LifoQueue(self._size)
        self._gate = threading.BoundedSemaphore(self._size)
        self._created = 0
        self._lock = threading.Lock()

    # -- internal ---------------------------------------------------------
    def _connect(self) -> pymysql.connections.Connection:
        return pymysql.connect(
            cursorclass=DictCursor,
            charset="utf8mb4",
            autocommit=False,
            **self._kwargs,
        )

    def _borrow(self) -> pymysql.connections.Connection:
        try:
            return self._idle.get_nowait()
        except queue.Empty:
            pass
        with self._lock:
            if self._created < self._size:
                self._created += 1
                return self._connect()
        # 信号量正常情况下不会走到这里，兜底新建一个
        return self._connect()

    def _release(self, conn: pymysql.connections.Connection, broken: bool) -> None:
        if broken:
            try:
                conn.close()
            except Exception:
                pass
            with self._lock:
                self._created = max(0, self._created - 1)
            return
        try:
            self._idle.put_nowait(conn)
        except queue.Full:
            try:
                conn.close()
            except Exception:
                pass
            with self._lock:
                self._created = max(0, self._created - 1)

    # -- public -----------------------------------------------------------
    @contextmanager
    def connection(self):
        """借出一个连接，正常退出时提交，异常时回滚。"""
        self._gate.acquire()
        conn: Optional[pymysql.connections.Connection] = None
        broken = False
        try:
            conn = self._borrow()
            try:
                conn.ping(reconnect=True)
            except Exception:
                try:
                    conn.close()
                except Exception:
                    pass
                conn = self._connect()
            yield conn
            conn.commit()
        except BaseException:
            broken = True
            if conn is not None:
                try:
                    conn.rollback()
                except Exception:
                    pass
            raise
        finally:
            if conn is not None:
                self._release(conn, broken)
            self._gate.release()


_pool: Optional[ConnectionPool] = None
_pool_lock = threading.Lock()


def get_pool() -> ConnectionPool:
    global _pool
    if _pool is None:
        with _pool_lock:
            if _pool is None:
                _pool = ConnectionPool(size=settings.DB_POOL_SIZE, **settings.db_kwargs)
    return _pool


@contextmanager
def get_cursor():
    """用法: with get_cursor() as cur: cur.execute(...)"""
    with get_pool().connection() as conn:
        cur = conn.cursor()
        try:
            yield cur
        finally:
            try:
                cur.close()
            except Exception:
                pass


# --- 便捷函数 -------------------------------------------------------------

def query_all(sql: str, args: Sequence[Any] | None = None) -> list[dict]:
    with get_cursor() as cur:
        cur.execute(sql, args or ())
        return list(cur.fetchall())


def query_one(sql: str, args: Sequence[Any] | None = None) -> Optional[dict]:
    with get_cursor() as cur:
        cur.execute(sql, args or ())
        return cur.fetchone()


def query_scalar(sql: str, args: Sequence[Any] | None = None, default: Any = None) -> Any:
    row = query_one(sql, args)
    if not row:
        return default
    value = next(iter(row.values()), default)
    return default if value is None else value


def execute(sql: str, args: Sequence[Any] | None = None) -> int:
    """执行写操作，返回受影响行数。"""
    with get_cursor() as cur:
        return cur.execute(sql, args or ())


def insert(sql: str, args: Sequence[Any] | None = None) -> int:
    """执行插入，返回自增主键。"""
    with get_cursor() as cur:
        cur.execute(sql, args or ())
        return int(cur.lastrowid or 0)


def insert_many(sql: str, rows: Iterable[Sequence[Any]]) -> int:
    rows = list(rows)
    if not rows:
        return 0
    with get_cursor() as cur:
        return cur.executemany(sql, rows)


def healthcheck() -> dict:
    """返回数据库连通性与基础统计。"""
    info = query_one("SELECT VERSION() AS version, DATABASE() AS db_name")
    user_count = query_scalar("SELECT COUNT(*) FROM users", default=0)
    product_count = query_scalar(
        "SELECT COUNT(*) FROM products WHERE is_deleted = 0", default=0
    )
    return {
        "connected": True,
        "version": (info or {}).get("version"),
        "database": (info or {}).get("db_name"),
        "users": int(user_count),
        "products": int(product_count),
    }

/* ==========================================================================
   api.js —— 后端接口封装 / 令牌管理 / 统一错误处理
   ========================================================================== */

const TOKEN_KEY = 'cm_token';
const USER_KEY = 'cm_user';

/* ---------- 令牌与当前用户 ---------- */
export const auth = {
  get token() {
    return localStorage.getItem(TOKEN_KEY) || '';
  },
  set token(v) {
    if (v) localStorage.setItem(TOKEN_KEY, v);
    else localStorage.removeItem(TOKEN_KEY);
  },
  get user() {
    try {
      const raw = localStorage.getItem(USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },
  set user(u) {
    if (u) localStorage.setItem(USER_KEY, JSON.stringify(u));
    else localStorage.removeItem(USER_KEY);
  },
  clear() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },
  get isLogin() {
    return !!this.token;
  },
  get isAdmin() {
    return this.user?.role === 'admin';
  },
};

/* ---------- 错误类型 ---------- */
export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/* ---------- 底层请求 ---------- */
async function request(method, path, { body, form, query, silent } = {}) {
  let url = path.startsWith('http') ? path : path;
  if (query && typeof query === 'object') {
    const qs = new URLSearchParams();
    Object.entries(query).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') qs.append(k, v);
    });
    const s = qs.toString();
    if (s) url += (url.includes('?') ? '&' : '?') + s;
  }

  const headers = {};
  if (auth.token) headers['Authorization'] = 'Bearer ' + auth.token;

  let payload;
  if (form) {
    payload = form; // FormData：交给浏览器设置 Content-Type
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(url, { method, headers, body: payload });
  } catch (e) {
    throw new ApiError('网络连接失败，请确认后端服务已启动', 0);
  }

  // 令牌失效：清理本地登录态
  if (res.status === 401) {
    const msg = await safeDetail(res);
    if (!silent) auth.clear();
    throw new ApiError(msg || '登录已过期，请重新登录', 401);
  }

  if (!res.ok) {
    const msg = await safeDetail(res);
    throw new ApiError(msg || `请求失败（${res.status}）`, res.status);
  }

  if (res.status === 204) return null;
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) return res.json();
  return res.text();
}

async function safeDetail(res) {
  try {
    const data = await res.json();
    if (typeof data?.detail === 'string') return data.detail;
    if (Array.isArray(data?.detail)) {
      // FastAPI 校验错误
      return data.detail.map((d) => `${(d.loc || []).slice(1).join('.')}: ${d.msg}`).join('；');
    }
    return data?.message || '';
  } catch {
    return '';
  }
}

/* ==========================================================================
   统一 API 门面
   ========================================================================== */
export const api = {
  /* ---- 健康检查 ---- */
  health: () => request('GET', '/api/health'),

  /* ---- 认证 ---- */
  register: (data) => request('POST', '/api/auth/register', { body: data }),
  login: (data) => request('POST', '/api/auth/login', { body: data }),
  logout: () => request('POST', '/api/auth/logout', { silent: true }),
  me: () => request('GET', '/api/auth/me', { silent: true }),
  updateMe: (data) => request('PUT', '/api/auth/me', { body: data }),
  changePassword: (data) => request('PUT', '/api/auth/me/password', { body: data }),

  /* ---- 分类 ---- */
  categories: () => request('GET', '/api/categories'),
  publicStats: () => request('GET', '/api/stats', { silent: true }),

  /* ---- 商品 ---- */
  products: (query) => request('GET', '/api/products', { query }),
  myProducts: (query) => request('GET', '/api/products/mine', { query }),
  product: (id) => request('GET', `/api/products/${id}`),
  createProduct: (data) => request('POST', '/api/products', { body: data }),
  updateProduct: (id, data) => request('PUT', `/api/products/${id}`, { body: data }),
  setProductStatus: (id, status) => request('POST', `/api/products/${id}/status`, { body: { status } }),
  deleteProduct: (id) => request('DELETE', `/api/products/${id}`),
  toggleFavorite: (id) => request('POST', `/api/products/${id}/favorite`),
  favorites: (query) => request('GET', '/api/favorites', { query }),
  upload: (file) => {
    const fd = new FormData();
    fd.append('file', file);
    return request('POST', '/api/upload', { form: fd });
  },

  /* ---- 用户主页 ---- */
  userProfile: (id) => request('GET', `/api/users/${id}`),
  userProducts: (id, query) => request('GET', `/api/users/${id}/products`, { query }),
  userReviews: (id, query) => request('GET', `/api/users/${id}/reviews`, { query }),

  /* ---- 订单 ---- */
  orderSummary: () => request('GET', '/api/orders/summary', { silent: true }),
  createOrder: (data) => request('POST', '/api/orders', { body: data }),
  orders: (query) => request('GET', '/api/orders', { query }),
  order: (id) => request('GET', `/api/orders/${id}`),
  orderAction: (id, action, reason) =>
    request('POST', `/api/orders/${id}/action`, { body: { action, reason } }),
  reviewOrder: (id, data) => request('POST', `/api/orders/${id}/review`, { body: data }),

  /* ---- 消息 ---- */
  conversations: () => request('GET', '/api/messages/conversations'),
  unreadCount: () => request('GET', '/api/messages/unread-count', { silent: true }),
  thread: (query) => request('GET', '/api/messages/thread', { query }),
  sendMessage: (data) => request('POST', '/api/messages', { body: data }),
  readThread: (peerId) => request('POST', '/api/messages/read', { query: { peer_id: peerId } }),

  /* ---- 后台 ---- */
  adminStats: () => request('GET', '/api/admin/stats'),
  adminUsers: (query) => request('GET', '/api/admin/users', { query }),
  adminSetUserStatus: (id, status) =>
    request('POST', `/api/admin/users/${id}/status`, { body: { status } }),
  adminProducts: (query) => request('GET', '/api/admin/products', { query }),
  adminDeleteProduct: (id) => request('DELETE', `/api/admin/products/${id}`),
  adminOrders: (query) => request('GET', '/api/admin/orders', { query }),
};

export default api;

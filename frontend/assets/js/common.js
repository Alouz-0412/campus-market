/* ==========================================================================
   common.js —— 顶栏 / 提示 / 弹窗 / 通用渲染工具
   ========================================================================== */
import api, { auth } from './api.js';

/* ========================== 小工具 ========================== */
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function fmtPrice(n) {
  const v = Number(n || 0);
  return v % 1 === 0 ? String(v) : v.toFixed(2);
}

export function money(n) {
  return '¥' + fmtPrice(n);
}

function parseTime(s) {
  if (!s) return null;
  // 后端返回 "YYYY-MM-DD HH:MM:SS"，Safari 需要把空格换成 T
  const d = new Date(String(s).replace(' ', 'T'));
  return isNaN(d.getTime()) ? null : d;
}

export function fmtDate(s) {
  const d = parseTime(s);
  if (!d) return '—';
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function fmtDateTime(s) {
  const d = parseTime(s);
  if (!d) return '—';
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function timeAgo(s) {
  const d = parseTime(s);
  if (!d) return '—';
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return '刚刚';
  if (diff < 3600) return Math.floor(diff / 60) + ' 分钟前';
  if (diff < 86400) return Math.floor(diff / 3600) + ' 小时前';
  if (diff < 86400 * 7) return Math.floor(diff / 86400) + ' 天前';
  if (diff < 86400 * 365) {
    const p = (x) => String(x).padStart(2, '0');
    return `${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }
  return fmtDate(s);
}

export function chatTime(s) {
  const d = parseTime(s);
  if (!d) return '';
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const p = (x) => String(x).padStart(2, '0');
  if (sameDay) return `${p(d.getHours())}:${p(d.getMinutes())}`;
  if (d.getFullYear() === now.getFullYear()) return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  return fmtDate(s);
}

export function debounce(fn, wait = 300) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

export function getQuery(name, fallback = '') {
  return new URLSearchParams(location.search).get(name) ?? fallback;
}

export function numberFmt(n) {
  const v = Number(n || 0);
  if (v >= 10000) return (v / 10000).toFixed(v % 10000 === 0 ? 0 : 1) + 'w';
  return String(v);
}

/* ========================== 头像 / 星级 ========================== */
export function avatarHtml(user, cls = '') {
  const size = cls.includes('avatar-lg') ? 'lg' : cls.includes('avatar-sm') ? 'sm' : '';
  const name = user?.nickname || user?.username || '?';
  const initial = escapeHtml(name.trim().charAt(0).toUpperCase() || '?');
  if (user?.avatar) {
    return `<img class="avatar ${cls}" src="${escapeHtml(user.avatar)}" alt="${escapeHtml(name)}"
              onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'avatar ${cls}',textContent:'${initial}'}))">`;
  }
  return `<div class="avatar ${cls}" title="${escapeHtml(name)}">${initial}</div>`;
}

export function starsHtml(rating) {
  const r = Math.round(Number(rating) || 0);
  let out = '';
  for (let i = 1; i <= 5; i++) out += i <= r ? '★' : '<span class="off">★</span>';
  return `<span class="stars">${out}</span>`;
}

/* ========================== 常量标签 ========================== */
export const CONDITION_LABELS = { 1: '全新', 2: '几乎全新', 3: '轻微使用痕迹', 4: '明显使用痕迹' };
export const PRODUCT_STATUS_LABELS = {
  on_sale: '在售', reserved: '已预订', sold: '已售出', off_shelf: '已下架',
};
export const ORDER_STATUS_LABELS = {
  pending: '待卖家确认', accepted: '待交易完成', completed: '已完成', cancelled: '已取消',
};

export function productStatusTag(status) {
  const map = {
    on_sale: 'tag-success', reserved: 'tag-warning', sold: 'tag', off_shelf: 'tag',
  };
  return `<span class="tag ${map[status] || 'tag'}">${PRODUCT_STATUS_LABELS[status] || status}</span>`;
}

export function orderStatusTag(status) {
  const map = {
    pending: 'tag-warning', accepted: 'tag-primary', completed: 'tag-success', cancelled: 'tag',
  };
  return `<span class="tag ${map[status] || 'tag'}">${ORDER_STATUS_LABELS[status] || status}</span>`;
}

/* ========================== Toast ========================== */
let toastWrap;
export function toast(message, type = '') {
  if (!toastWrap) {
    toastWrap = document.createElement('div');
    toastWrap.className = 'toast-wrap';
    document.body.appendChild(toastWrap);
  }
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = message;
  toastWrap.appendChild(el);
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 240);
  }, 2200);
}

export const toastOk = (m) => toast(m, 'success');
export const toastErr = (m) => toast(m, 'error');

/* ========================== 弹窗 ========================== */
export function openModal({ title = '', body = '', foot = '', size = '', onMount, onClose } = {}) {
  const mask = document.createElement('div');
  mask.className = 'modal-mask';
  mask.innerHTML = `
    <div class="modal ${size}">
      ${title ? `<div class="modal-head"><h3>${escapeHtml(title)}</h3><button class="modal-close" type="button">✕</button></div>` : ''}
      <div class="modal-body">${body}</div>
      ${foot ? `<div class="modal-foot">${foot}</div>` : ''}
    </div>`;
  document.body.appendChild(mask);
  document.body.style.overflow = 'hidden';

  const close = () => {
    mask.remove();
    document.body.style.overflow = '';
    onClose?.();
  };
  mask.addEventListener('click', (e) => { if (e.target === mask) close(); });
  $('.modal-close', mask)?.addEventListener('click', close);
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
  });
  onMount?.(mask, close);
  return { mask, close, $: (s) => $(s, mask) };
}

export function confirmDialog({ title = '确认操作', message = '', okText = '确定', cancelText = '取消', danger = false } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const m = openModal({
      title,
      body: `<p style="margin:0 0 4px;color:var(--text-secondary);line-height:1.7">${escapeHtml(message)}</p>`,
      foot: `<button class="btn btn-default" data-no>${escapeHtml(cancelText)}</button>
             <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-yes>${escapeHtml(okText)}</button>`,
      onMount(mask, close) {
        $('[data-yes]', mask).addEventListener('click', () => { settled = true; close(); resolve(true); });
        $('[data-no]', mask).addEventListener('click', () => { settled = true; close(); resolve(false); });
      },
      onClose: () => { if (!settled) resolve(false); },
    });
  });
}

/** 需要填写理由的确认框（如取消订单） */
export function reasonDialog({ title = '请输入理由', placeholder = '选填', okText = '提交' } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const m = openModal({
      title,
      body: `<textarea class="textarea" data-reason placeholder="${escapeHtml(placeholder)}"></textarea>`,
      foot: `<button class="btn btn-default" data-no>取消</button>
             <button class="btn btn-primary" data-yes>${escapeHtml(okText)}</button>`,
      onMount(mask, close) {
        const ta = $('[data-reason]', mask);
        setTimeout(() => ta.focus(), 60);
        $('[data-yes]', mask).addEventListener('click', () => { settled = true; const v = ta.value.trim(); close(); resolve(v); });
        $('[data-no]', mask).addEventListener('click', () => { settled = true; close(); resolve(null); });
      },
      onClose: () => { if (!settled) resolve(null); },
    });
  });
}

/** 评分 + 评价弹窗 */
export function reviewDialog({ title = '发表评价' } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    let rating = 5;
    const m = openModal({
      title,
      body: `
        <div class="form-group">
          <label class="form-label">评分</label>
          <div class="stars" data-stars style="font-size:26px;cursor:pointer">
            ${[1, 2, 3, 4, 5].map((i) => `<span data-star="${i}">★</span>`).join('')}
          </div>
        </div>
        <div class="form-group" style="margin-bottom:0">
          <label class="form-label">评价内容</label>
          <textarea class="textarea" data-content maxlength="300" placeholder="说说这次交易的体验吧～"></textarea>
          <div class="form-hint">最多 300 字</div>
        </div>`,
      foot: `<button class="btn btn-default" data-no>取消</button>
             <button class="btn btn-primary" data-yes>提交评价</button>`,
      onMount(mask, close) {
        const stars = $$('[data-star]', mask);
        const paint = (n) => stars.forEach((s) => (s.style.color = Number(s.dataset.star) <= n ? '#fbbf24' : 'var(--border-strong)'));
        paint(rating);
        stars.forEach((s) =>
          s.addEventListener('click', () => { rating = Number(s.dataset.star); paint(rating); }));
        $('[data-yes]', mask).addEventListener('click', () => {
          const content = $('[data-content]', mask).value.trim();
          if (!content) { toastErr('请填写评价内容'); return; }
          settled = true; close(); resolve({ rating, content });
        });
        $('[data-no]', mask).addEventListener('click', () => { settled = true; close(); resolve(null); });
      },
      onClose: () => { if (!settled) resolve(null); },
    });
  });
}

/* ========================== 状态占位 ========================== */
export function showLoading(container, text = '加载中…') {
  container.innerHTML = `<div class="loading"><div class="spinner"></div>${escapeHtml(text)}</div>`;
}

export function showEmpty(container, { emoji = '📭', title = '暂无数据', desc = '', action = '' } = {}) {
  container.innerHTML = `
    <div class="empty">
      <div class="emoji">${emoji}</div>
      <div class="title">${escapeHtml(title)}</div>
      ${desc ? `<div>${escapeHtml(desc)}</div>` : ''}
      ${action}
    </div>`;
}

export function showError(container, err, retryHtml = '') {
  const msg = err?.message || '加载失败';
  container.innerHTML = `
    <div class="empty">
      <div class="emoji">😵</div>
      <div class="title">${escapeHtml(msg)}</div>
      ${retryHtml}
    </div>`;
}

/* ========================== 商品卡片 ========================== */
export function productCardHtml(p) {
  const sold = p.status === 'sold';
  const flags = {
    reserved: '<span class="corner-flag flag-reserved">已预订</span>',
    sold: '<span class="corner-flag flag-sold">已售出</span>',
    off_shelf: '<span class="corner-flag flag-off_shelf">已下架</span>',
  };
  const cover = p.cover
    ? `<img src="${escapeHtml(p.cover)}" alt="${escapeHtml(p.title)}" loading="lazy">`
    : `<div class="placeholder">${escapeHtml(p.category_icon || '📦')}</div>`;
  const myCampus = auth.user?.campus || '';
  const same = !!myCampus && !!p.seller_campus && p.seller_campus === myCampus;
  const campusBadge = p.seller_campus
    ? `<span class="campus-badge${same ? ' same' : ''}">🏫 ${escapeHtml(p.seller_campus)}</span>`
    : '';
  const seller = p.seller_nickname
    ? `<span class="seller">${avatarHtml({ nickname: p.seller_nickname, avatar: p.seller_avatar }, 'avatar-sm')}
         <span class="ellipsis" style="max-width:${campusBadge ? 56 : 80}px">${escapeHtml(p.seller_nickname)}</span>
         ${campusBadge}</span>`
    : '<span></span>';

  return `
  <div class="product-card${same ? ' same-campus' : ''}" data-pid="${p.id}">
    <a class="product-cover" href="product.html?id=${p.id}">
      ${cover}
      ${flags[p.status] || ''}
      ${sold ? '<div class="sold-mask">已售出</div>' : ''}
    </a>
    <button class="fav-btn ${p.is_favorited ? 'active' : ''}" data-fav="${p.id}"
            title="${p.is_favorited ? '取消收藏' : '收藏'}">${p.is_favorited ? '❤️' : '🤍'}</button>
    <div class="product-body">
      <div class="product-title"><a href="product.html?id=${p.id}" title="${escapeHtml(p.title)}">${escapeHtml(p.title)}</a></div>
      <div class="product-price"><span class="unit">¥</span>${fmtPrice(p.price)}
        ${p.original_price ? `<span class="orig">¥${fmtPrice(p.original_price)}</span>` : ''}</div>
      <div class="product-meta">
        ${seller}
        <span title="浏览量">👁 ${numberFmt(p.view_count)}</span>
      </div>
    </div>
  </div>`;
}

export function renderProducts(container, items, emptyOpts = {}) {
  if (!items || items.length === 0) {
    showEmpty(container, { emoji: '🔍', title: '没有找到相关商品', desc: '换个关键词或分类试试', ...emptyOpts });
    return false;
  }
  container.innerHTML = items.map(productCardHtml).join('');
  return true;
}

/* ========================== 分页 ========================== */
export function renderPager(container, { page = 1, pages = 1, total = 0 } = {}, onChange) {
  if (!container) return;
  if (!total || pages <= 1) { container.innerHTML = ''; return; }

  const btn = (label, target, opts = {}) =>
    `<button ${opts.active ? 'class="active"' : ''} ${opts.disabled ? 'disabled' : ''} data-page="${target}">${label}</button>`;

  const parts = [];
  parts.push(btn('‹ 上一页', page - 1, { disabled: page <= 1 }));

  const nums = new Set([1, pages, page, page - 1, page + 1]);
  if (page <= 3) [2, 3, 4].forEach((n) => nums.add(n));
  if (page >= pages - 2) [pages - 1, pages - 2, pages - 3].forEach((n) => nums.add(n));
  const list = [...nums].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);

  let prev = 0;
  for (const n of list) {
    if (n - prev > 1) parts.push('<span class="info">…</span>');
    parts.push(btn(n, n, { active: n === page }));
    prev = n;
  }
  parts.push(btn('下一页 ›', page + 1, { disabled: page >= pages }));

  container.innerHTML = parts.join('');
  $$('button[data-page]', container).forEach((b) =>
    b.addEventListener('click', () => onChange?.(Number(b.dataset.page))));
}

/* ========================== 顶栏 ========================== */
const NAV_ITEMS = [
  { key: 'home', label: '首页', href: 'index.html' },
  { key: 'messages', label: '消息', href: 'messages.html' },
  { key: 'me', label: '个人中心', href: 'me.html' },
];

export async function initTopbar(activeKey = '') {
  const host = document.getElementById('topbar');
  if (!host) return;

  const logoSvg = `<span class="logo-mark">🎓</span>
    <span style="display:flex;flex-direction:column;line-height:1.1">校园集市
      <span class="logo-sub">CAMPUS MARKET</span></span>`;

  host.className = 'topbar';
  host.innerHTML = `
    <div class="container">
      <a class="logo" href="index.html">${logoSvg}</a>
      <nav class="nav">
        ${NAV_ITEMS.map((i) => `<a href="${i.href}" class="${activeKey === i.key ? 'active' : ''}">${i.label}</a>`).join('')}
        ${auth.isAdmin ? `<a href="admin.html" class="${activeKey === 'admin' ? 'active' : ''}">后台管理</a>` : ''}
      </nav>
      <div class="search-bar">
        <span class="icon">🔍</span>
        <input type="text" id="globalSearch" placeholder="搜索教材、数码、生活用品…" value="${escapeHtml(getQuery('keyword'))}">
      </div>
      <div class="topbar-actions">
        <a class="btn btn-primary btn-sm" href="publish.html" style="height:38px;padding:0 18px">＋ 发布闲置</a>
        ${auth.isLogin
          ? `<a class="icon-btn" href="messages.html" title="消息">💬<span class="badge-dot hidden" id="unreadDot">0</span></a>
             <div class="user-menu" id="userMenu">
               <div class="user-menu-trigger">
                 ${avatarHtml(auth.user, 'avatar-sm')}
                 <span class="fw-600 ellipsis" style="max-width:88px">${escapeHtml(auth.user?.nickname || '我')}</span>
                 <span style="color:var(--text-muted);font-size:11px">▼</span>
               </div>
               <div class="user-menu-dropdown">
                 <div class="user-menu-head">
                   <div class="fw-600">${escapeHtml(auth.user?.nickname || '')}</div>
                   <div class="text-muted" style="font-size:12px">${escapeHtml(auth.user?.campus || auth.user?.email || '')}</div>
                 </div>
                 <a href="me.html">👤 个人中心</a>
                 <a href="me.html#orders">📦 我的订单</a>
                 <a href="me.html#favorites">❤️ 我的收藏</a>
                 <a href="me.html#products">📋 我发布的</a>
                 ${auth.isAdmin ? '<a href="admin.html">⚙️ 后台管理</a>' : ''}
                 <div class="divider"></div>
                 <button type="button" id="logoutBtn">🚪 退出登录</button>
               </div>
             </div>`
          : `<a class="btn btn-default btn-sm" href="login.html" style="height:38px">登录</a>
             <a class="btn btn-primary btn-sm" href="register.html" style="height:38px">注册</a>`}
      </div>
    </div>`;

  /* 搜索 */
  const input = $('#globalSearch', host);
  const doSearch = () => {
    const kw = input.value.trim();
    location.href = 'index.html' + (kw ? '?keyword=' + encodeURIComponent(kw) : '');
  };
  input?.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });

  /* 用户菜单 */
  const menu = $('#userMenu', host);
  if (menu) {
    $('.user-menu-trigger', menu).addEventListener('click', (e) => {
      e.stopPropagation();
      menu.classList.toggle('open');
    });
    document.addEventListener('click', () => menu.classList.remove('open'));
    $('#logoutBtn', menu).addEventListener('click', async () => {
      try { await api.logout(); } catch { /* 忽略 */ }
      auth.clear();
      toastOk('已退出登录');
      setTimeout(() => (location.href = 'index.html'), 500);
    });
  }

  if (auth.isLogin) refreshUnread();
}

export async function refreshUnread() {
  if (!auth.isLogin) return;
  const dot = document.getElementById('unreadDot');
  if (!dot) return;
  try {
    const { unread } = await api.unreadCount();
    if (unread > 0) {
      dot.textContent = unread > 99 ? '99+' : unread;
      dot.classList.remove('hidden');
    } else {
      dot.classList.add('hidden');
    }
    return unread;
  } catch { /* 静默 */ }
}

/* ========================== 全站收藏按钮代理 ========================== */
export function initFavDelegate() {
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-fav]');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    if (!auth.isLogin) {
      toast('请先登录后再收藏', 'warning');
      setTimeout(() => (location.href = 'login.html?redirect=' + encodeURIComponent(location.pathname + location.search)), 800);
      return;
    }
    if (btn.disabled) return;
    btn.disabled = true;
    try {
      const { favorited, favorite_count } = await api.toggleFavorite(btn.dataset.fav);
      btn.classList.toggle('active', favorited);
      btn.textContent = favorited ? '❤️' : '🤍';
      btn.title = favorited ? '取消收藏' : '收藏';
      toast(favorited ? '已加入收藏' : '已取消收藏', favorited ? 'success' : '');
      document.dispatchEvent(new CustomEvent('favorite-change', {
        detail: { productId: Number(btn.dataset.fav), favorited, favorite_count },
      }));
    } catch (err) {
      toastErr(err.message);
    } finally {
      btn.disabled = false;
    }
  });
}

/* ========================== 登录校验 ========================== */
export function requireLogin(message = '请先登录') {
  if (auth.isLogin) return true;
  toast(message, 'warning');
  setTimeout(() => {
    location.href = 'login.html?redirect=' + encodeURIComponent(location.pathname + location.search);
  }, 700);
  return false;
}

/** 校验并刷新本地用户信息（用于判断管理员等） */
export async function syncUser() {
  if (!auth.isLogin) return null;
  try {
    const user = await api.me();
    auth.user = user;
    return user;
  } catch {
    auth.clear();
    return null;
  }
}

/* ========================== 页脚 ========================== */
export function initFooter() {
  const host = document.getElementById('footer');
  if (!host) return;
  host.className = 'footer';
  host.innerHTML = `
    <div class="container">
      <div>🎓 校园集市 · 校园二手交易平台 &nbsp;|&nbsp; 让闲置流动起来</div>
      <div class="row-center" style="gap:18px">
        <a href="index.html">首页</a>
        <a href="publish.html">发布闲置</a>
        <a href="messages.html">消息</a>
        <span class="text-muted">DeepSeek Harness 构建 · 仅供学习演示</span>
      </div>
    </div>`;
}

/** 页面通用初始化：顶栏 + 页脚 + 收藏代理 */
export function initPage(activeKey) {
  initFavDelegate();
  initTopbar(activeKey);
  initFooter();
}

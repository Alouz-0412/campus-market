/* ==========================================================================
   admin.js —— 管理后台（数据总览 / 用户 / 商品 / 订单）
   ========================================================================== */
import api, { auth } from './api.js';
import {
  $, $$, escapeHtml, initPage, toastOk, toastErr, avatarHtml, fmtPrice, fmtDate, fmtDateTime,
  timeAgo, orderStatusTag, showLoading, showEmpty, showError, renderPager,
  confirmDialog, openModal,
} from './common.js';

initPage('admin');

/* ======================================================================
   权限守卫
   ====================================================================== */
if (!auth.isLogin) {
  toastErr('请先登录管理员账号');
  setTimeout(() => {
    location.replace('login.html?redirect=' + encodeURIComponent('admin.html'));
  }, 900);
  throw new Error('未登录');
}
if (!auth.isAdmin) {
  document.querySelector('main').innerHTML = `
    <div class="container">
      <div class="empty" style="padding:110px 20px">
        <div class="emoji">🔒</div>
        <div class="title">需要管理员权限</div>
        <div>当前账号（${escapeHtml(auth.user?.nickname || '')}）不是管理员</div>
        <a class="btn btn-primary" href="index.html">返回首页</a>
      </div>
    </div>`;
  throw new Error('非管理员');
}

/* ======================================================================
   左侧导航切换
   ====================================================================== */
let currentPanel = 'overview';
const loaded = {};

$$('#adminNav button').forEach((btn) =>
  btn.addEventListener('click', () => {
    const name = btn.dataset.panel;
    $$('#adminNav button').forEach((b) => b.classList.toggle('active', b === btn));
    $$('.adm-panel').forEach((p) => p.classList.toggle('active', p.id === 'panel-' + name));
    currentPanel = name;
    loadPanel(name, !loaded[name]);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }));

function loadPanel(name, first) {
  if (name === 'overview' && (first || !loaded.overview)) loadOverview();
  if (name === 'users') loadUsers();
  if (name === 'products') loadProducts();
  if (name === 'orders') loadOrders();
}

/* ======================================================================
   数据总览
   ====================================================================== */
async function loadOverview() {
  const grid = $('#statGrid');
  showLoading(grid, '正在统计数据…');
  try {
    const data = await api.adminStats();
    loaded.overview = true;
    const o = data.overview;

    const cards = [
      { label: '成交总额 GMV', value: '¥' + fmtPrice(o.gmv), foot: `已完成 ${o.orders_completed} 笔`, ico: '💰', primary: true },
      { label: '注册用户', value: o.users, foot: `今日新增 ${o.users_today}`, ico: '👥' },
      { label: '商品总数', value: o.products, foot: `在售 ${o.products_on_sale} · 已售 ${o.products_sold}`, ico: '🛍' },
      { label: '订单总数', value: o.orders, foot: `待确认 ${o.orders_pending}`, ico: '📦' },
      { label: '消息数', value: o.messages, foot: '站内私信', ico: '💬' },
      { label: '评价数', value: o.reviews, foot: '交易互评', ico: '⭐' },
    ];
    grid.innerHTML = cards.map((c) => `
      <div class="stat-card ${c.primary ? 'primary' : ''}">
        <div class="ico">${c.ico}</div>
        <div class="label">${c.label}</div>
        <div class="value">${typeof c.value === 'number' ? c.value : c.value}</div>
        <div class="foot">${c.foot}</div>
      </div>`).join('');

    renderTrend(data.trend || []);
    renderCategoryRank(data.category_rank || []);
    renderTopSellers(data.top_sellers || []);
    renderRecentOrders(data.recent_orders || []);
  } catch (err) {
    showError(grid, err, '<button class="btn btn-default" onclick="location.reload()">刷新页面</button>');
  }
}

function renderTrend(rows) {
  const box = $('#trendChart');
  if (!rows.length) { showEmpty(box, { emoji: '📈', title: '暂无数据' }); return; }
  const max = Math.max(1, ...rows.map((r) => Number(r.new_products) + Number(r.new_orders)));
  box.innerHTML = `
    <div class="bar-chart">
      ${rows.map((r) => {
        const total = Number(r.new_products) + Number(r.new_orders);
        const h = Math.max(3, Math.round((total / max) * 100));
        return `<div class="bar-col" title="新增商品 ${r.new_products} · 新增订单 ${r.new_orders} · 新增用户 ${r.new_users}">
          <div class="bar-value">${total}</div>
          <div class="bar" style="height:${h}%"></div>
          <div class="bar-label">${fmtDate(r.day).slice(5)}</div>
        </div>`;
      }).join('')}
    </div>
    <div class="text-muted text-center" style="font-size:12px;margin-top:10px">
      柱高 = 当日新增商品 + 新增订单；鼠标悬停看明细
    </div>`;
}

function renderCategoryRank(rows) {
  const box = $('#categoryRank');
  if (!rows.length) { showEmpty(box, { emoji: '📚', title: '暂无分类' }); return; }
  const max = Math.max(1, ...rows.map((r) => Number(r.cnt)));
  box.innerHTML = rows.map((r, i) => `
    <div class="rank-row">
      <span class="rank-no ${i === 0 ? 'top1' : i === 1 ? 'top2' : i === 2 ? 'top3' : ''}">${i + 1}</span>
      <span style="width:96px" class="ellipsis">${escapeHtml(r.icon || '')} ${escapeHtml(r.name)}</span>
      <div class="rank-bar"><span style="width:${Math.round((Number(r.cnt) / max) * 100)}%"></span></div>
      <span class="text-secondary fw-600" style="width:38px;text-align:right">${r.cnt}</span>
    </div>`).join('');
}

function renderTopSellers(rows) {
  const box = $('#topSellers');
  if (!rows.length) { showEmpty(box, { emoji: '🏆', title: '暂无数据' }); return; }
  const max = Math.max(1, ...rows.map((r) => Number(r.sold_orders)));
  box.innerHTML = rows.map((r, i) => `
    <div class="rank-row">
      <span class="rank-no ${i === 0 ? 'top1' : i === 1 ? 'top2' : i === 2 ? 'top3' : ''}">${i + 1}</span>
      ${avatarHtml(r, 'avatar-sm')}
      <a href="user.html?id=${r.id}" style="width:88px" class="ellipsis fw-600">${escapeHtml(r.nickname)}</a>
      <div class="rank-bar"><span style="width:${Math.round((Number(r.sold_orders) / max) * 100)}%"></span></div>
      <span class="text-secondary fw-600" style="width:64px;text-align:right">${r.sold_orders} 单</span>
    </div>`).join('');
}

function renderRecentOrders(rows) {
  const box = $('#recentOrders');
  if (!rows.length) { showEmpty(box, { emoji: '📦', title: '暂无订单' }); return; }
  box.innerHTML = rows.map((o) => `
    <div class="list-row" style="padding:12px 0">
      <div style="flex:1;min-width:0">
        <div class="ellipsis fw-600">${escapeHtml(o.title_snapshot)}</div>
        <div class="text-muted" style="font-size:12px;margin-top:3px">
          ${escapeHtml(o.buyer_nickname)} → ${escapeHtml(o.seller_nickname)} · ${timeAgo(o.created_at)}
        </div>
      </div>
      <span style="color:#ef4444;font-weight:700">¥${fmtPrice(o.amount)}</span>
      ${orderStatusTag(o.status)}
    </div>`).join('');
}

/* ======================================================================
   用户管理
   ====================================================================== */
const userState = { page: 1, keyword: '' };

async function loadUsers() {
  const table = $('#userTable');
  showLoading(table, '加载用户…');
  try {
    const data = await api.adminUsers({ ...userState, size: 15 });
    loaded.users = true;
    $('#userCount').textContent = `共 ${data.total} 位用户`;
    if (!data.items.length) {
      table.innerHTML = '<tbody><tr><td><div class="empty"><div class="emoji">👤</div><div class="title">没有匹配的用户</div></div></td></tr></tbody>';
      renderPager($('#userPager'), {}, null);
      return;
    }
    table.innerHTML = `
      <thead><tr>
        <th>ID</th><th>用户</th><th>联系方式</th><th>校区</th>
        <th>商品 / 买 / 卖</th><th>评分</th><th>注册时间</th><th>状态</th><th>操作</th>
      </tr></thead>
      <tbody>
        ${data.items.map((u) => `
          <tr>
            <td class="text-muted">${u.id}</td>
            <td>
              <div class="row-center" style="gap:8px">
                ${avatarHtml(u, 'avatar-sm')}
                <div style="min-width:0">
                  <div class="fw-600 ellipsis">${escapeHtml(u.nickname)}
                    ${u.role === 'admin' ? '<span class="tag tag-violet tag-sm">管理员</span>' : ''}
                  </div>
                  <div class="text-muted" style="font-size:12px">@${escapeHtml(u.username)}</div>
                </div>
              </div>
            </td>
            <td class="text-muted" style="font-size:12px">
              ${escapeHtml(u.email || '-')}<br>${escapeHtml(u.phone || '-')}
            </td>
            <td class="text-muted">${escapeHtml(u.campus || '-')}</td>
            <td class="text-muted">${u.product_count} / ${u.buy_count} / ${u.sell_count}</td>
            <td>${u.rating_avg ? `⭐ ${u.rating_avg}` : '<span class="text-muted">-</span>'}</td>
            <td class="text-muted" style="font-size:12px">${fmtDate(u.created_at)}</td>
            <td>${u.status ? '<span class="tag tag-success tag-sm">正常</span>' : '<span class="tag tag-danger tag-sm">已禁用</span>'}</td>
            <td>
              <button class="btn ${u.status ? 'btn-danger' : 'btn-success'} btn-sm"
                      data-toggle-user="${u.id}" data-status="${u.status ? 0 : 1}"
                      ${u.role === 'admin' || u.id === auth.user.id ? 'disabled' : ''}>
                ${u.status ? '禁用' : '启用'}
              </button>
            </td>
          </tr>`).join('')}
      </tbody>`;

    table.querySelectorAll('[data-toggle-user]').forEach((btn) =>
      btn.addEventListener('click', async () => {
        const id = Number(btn.dataset.toggleUser);
        const status = Number(btn.dataset.status);
        const ok = await confirmDialog({
          title: status ? '启用该用户？' : '禁用该用户？',
          message: status ? '启用后该用户可以正常登录和交易。' : '禁用后该用户将无法登录，已登录的会话也会失效。',
          okText: status ? '启用' : '禁用',
          danger: !status,
        });
        if (!ok) return;
        try {
          await api.adminSetUserStatus(id, status);
          toastOk(status ? '已启用' : '已禁用');
          loadUsers();
        } catch (err) { toastErr(err.message); }
      }));

    renderPager($('#userPager'), data, (p) => { userState.page = p; loadUsers(); });
  } catch (err) {
    showError(table, err);
  }
}

/* ======================================================================
   商品管理
   ====================================================================== */
const productState = { page: 1, keyword: '', status: '' };

async function loadProducts() {
  const table = $('#productTable');
  showLoading(table, '加载商品…');
  try {
    const query = { page: productState.page, size: 15 };
    if (productState.keyword) query.keyword = productState.keyword;
    if (productState.status) query.status = productState.status;
    const data = await api.adminProducts(query);
    loaded.products = true;
    $('#productCount').textContent = `共 ${data.total} 件商品`;
    if (!data.items.length) {
      table.innerHTML = '<tbody><tr><td><div class="empty"><div class="emoji">🛍</div><div class="title">没有匹配的商品</div></div></td></tr></tbody>';
      renderPager($('#productPager'), {}, null);
      return;
    }
    table.innerHTML = `
      <thead><tr>
        <th>ID</th><th>商品</th><th>卖家</th><th>分类</th>
        <th>价格</th><th>成色</th><th>浏览 / 收藏</th><th>状态</th><th>操作</th>
      </tr></thead>
      <tbody>
        ${data.items.map((p) => `
          <tr>
            <td class="text-muted">${p.id}</td>
            <td>
              <div class="row-center" style="gap:8px">
                ${p.cover
                  ? `<img src="${escapeHtml(p.cover)}" class="order-thumb" style="width:44px;height:44px" alt="">`
                  : `<div class="order-thumb" style="width:44px;height:44px;display:grid;place-items:center;font-size:20px">${escapeHtml(p.category_icon || '📦')}</div>`}
                <a href="product.html?id=${p.id}" class="fw-600 ellipsis" style="max-width:230px">${escapeHtml(p.title)}</a>
              </div>
            </td>
            <td><a href="user.html?id=${p.seller_id}" class="text-secondary">${escapeHtml(p.seller_nickname || '-')}</a></td>
            <td class="text-muted">${escapeHtml(p.category_icon || '')} ${escapeHtml(p.category_name || '-')}</td>
            <td style="color:#ef4444;font-weight:700">¥${fmtPrice(p.price)}</td>
            <td class="text-muted">${escapeHtml(p.condition_label || '-')}</td>
            <td class="text-muted">${p.view_count} / ${p.favorite_count}</td>
            <td>${productStatusTagAdmin(p)}</td>
            <td>
              <div class="row-center" style="gap:6px">
                <a class="btn btn-default btn-sm" href="product.html?id=${p.id}">查看</a>
                <button class="btn btn-danger btn-sm" data-del-product="${p.id}" data-title="${escapeHtml(p.title)}">删除</button>
              </div>
            </td>
          </tr>`).join('')}
      </tbody>`;

    table.querySelectorAll('[data-del-product]').forEach((btn) =>
      btn.addEventListener('click', async () => {
        const id = Number(btn.dataset.delProduct);
        const ok = await confirmDialog({
          title: '下架并删除该商品？',
          message: `《${btn.dataset.title}》将被下架，用户端不再可见。`,
          okText: '确认删除',
          danger: true,
        });
        if (!ok) return;
        try {
          await api.adminDeleteProduct(id);
          toastOk('已下架并删除');
          loadProducts();
        } catch (err) { toastErr(err.message); }
      }));

    renderPager($('#productPager'), data, (p) => { productState.page = p; loadProducts(); });
  } catch (err) {
    showError(table, err);
  }
}

function productStatusTagAdmin(p) {
  const map = {
    on_sale: 'tag-success', reserved: 'tag-warning',
    sold: 'tag-primary', off_shelf: 'tag-danger',
  };
  return `<span class="tag ${map[p.status] || ''} tag-sm">${escapeHtml(p.status_label || p.status)}</span>`;
}

/* ======================================================================
   订单管理
   ====================================================================== */
const orderState = { page: 1, keyword: '', status: '' };

async function loadOrders() {
  const table = $('#orderTable');
  showLoading(table, '加载订单…');
  try {
    const query = { page: orderState.page, size: 15 };
    if (orderState.keyword) query.keyword = orderState.keyword;
    if (orderState.status) query.status = orderState.status;
    const data = await api.adminOrders(query);
    loaded.orders = true;
    $('#orderCount').textContent = `共 ${data.total} 笔订单`;
    if (!data.items.length) {
      table.innerHTML = '<tbody><tr><td><div class="empty"><div class="emoji">📦</div><div class="title">没有匹配的订单</div></div></td></tr></tbody>';
      renderPager($('#orderPager'), {}, null);
      return;
    }
    table.innerHTML = `
      <thead><tr>
        <th>订单号</th><th>商品</th><th>买家</th><th>卖家</th>
        <th>金额</th><th>面交信息</th><th>状态</th><th>下单时间</th><th></th>
      </tr></thead>
      <tbody>
        ${data.items.map((o) => `
          <tr>
            <td class="text-muted" style="font-size:12px">${escapeHtml(o.order_no)}</td>
            <td><a href="product.html?id=${o.product_id}" class="fw-600 ellipsis" style="max-width:200px;display:block">${escapeHtml(o.title_snapshot)}</a></td>
            <td class="text-secondary">${escapeHtml(o.buyer_nickname || '-')}</td>
            <td class="text-secondary">${escapeHtml(o.seller_nickname || '-')}</td>
            <td style="color:#ef4444;font-weight:700">¥${fmtPrice(o.amount)}</td>
            <td class="text-muted" style="font-size:12px">
              ${escapeHtml(o.trade_place || '-')}<br>${escapeHtml(o.trade_time || '')}
            </td>
            <td>${orderStatusTag(o.status)}</td>
            <td class="text-muted" style="font-size:12px">${fmtDateTime(o.created_at)}</td>
            <td><button class="btn btn-default btn-sm" data-view-order="${o.id}">详情</button></td>
          </tr>`).join('')}
      </tbody>`;

    table.querySelectorAll('[data-view-order]').forEach((btn) =>
      btn.addEventListener('click', () => showOrderDetail(Number(btn.dataset.viewOrder))));

    renderPager($('#orderPager'), data, (p) => { orderState.page = p; loadOrders(); });
  } catch (err) {
    showError(table, err);
  }
}

function showOrderDetail(id) {
  openModal({
    title: '订单详情',
    size: 'lg',
    body: '<div class="loading"><div class="spinner"></div>加载中…</div>',
    onMount: async (mask) => {
      const body = $('.modal-body', mask);
      try {
        // 后台没有独立的订单详情接口，复用用户端 /api/orders/{id}
        // （后端已允许 admin 查看任意订单）
        const data = await api.order(id);
        const o = data.order || data;
        body.innerHTML = `
          <div class="detail-attrs">
            <div class="detail-attr"><span class="k">订单号</span><span class="v">${escapeHtml(o.order_no)}</span></div>
            <div class="detail-attr"><span class="k">状态</span><span class="v">${escapeHtml(o.status_label || o.status)}</span></div>
            <div class="detail-attr"><span class="k">商品</span><span class="v">${escapeHtml(o.title_snapshot)}</span></div>
            <div class="detail-attr"><span class="k">金额</span><span class="v">¥${fmtPrice(o.amount)}</span></div>
            <div class="detail-attr"><span class="k">买家</span><span class="v">${escapeHtml(o.buyer_nickname || '-')}</span></div>
            <div class="detail-attr"><span class="k">卖家</span><span class="v">${escapeHtml(o.seller_nickname || '-')}</span></div>
            <div class="detail-attr"><span class="k">面交地点</span><span class="v">${escapeHtml(o.trade_place || '-')}</span></div>
            <div class="detail-attr"><span class="k">面交时间</span><span class="v">${escapeHtml(o.trade_time || '-')}</span></div>
            <div class="detail-attr"><span class="k">买家留言</span><span class="v">${escapeHtml(o.remark || '-')}</span></div>
            <div class="detail-attr"><span class="k">取消原因</span><span class="v">${escapeHtml(o.cancel_reason || '-')}</span></div>
          </div>`;
      } catch (err) {
        body.innerHTML =
          `<div class="empty"><div class="emoji">🔒</div><div class="title">${escapeHtml(err.message)}</div></div>`;
      }
    },
  });
}

/* ======================================================================
   搜索 / 重置 / 刷新
   ====================================================================== */
$('#userSearchBtn').addEventListener('click', () => { userState.keyword = $('#userKeyword').value.trim(); userState.page = 1; loadUsers(); });
$('#userResetBtn').addEventListener('click', () => { $('#userKeyword').value = ''; userState.keyword = ''; userState.page = 1; loadUsers(); });
$('#userKeyword').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#userSearchBtn').click(); });

$('#productSearchBtn').addEventListener('click', () => { productState.keyword = $('#productKeyword').value.trim(); productState.status = $('#productStatusSel').value; productState.page = 1; loadProducts(); });
$('#productResetBtn').addEventListener('click', () => { $('#productKeyword').value = ''; $('#productStatusSel').value = ''; productState.keyword = ''; productState.status = ''; productState.page = 1; loadProducts(); });
$('#productKeyword').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#productSearchBtn').click(); });

$('#orderSearchBtn').addEventListener('click', () => { orderState.keyword = $('#orderKeyword').value.trim(); orderState.status = $('#orderStatusSel').value; orderState.page = 1; loadOrders(); });
$('#orderResetBtn').addEventListener('click', () => { $('#orderKeyword').value = ''; $('#orderStatusSel').value = ''; orderState.keyword = ''; orderState.status = ''; orderState.page = 1; loadOrders(); });
$('#orderKeyword').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#orderSearchBtn').click(); });

$('#refreshBtn').addEventListener('click', () => {
  loaded.overview = false;
  loadPanel(currentPanel, true);
  toastOk('已刷新');
});

/* ======================================================================
   启动
   ====================================================================== */
loadOverview();

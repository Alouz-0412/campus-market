/* ==========================================================================
   me.js —— 个人中心：订单 / 我的商品 / 收藏 / 资料
   ========================================================================== */
import api, { auth } from './api.js';
import {
  $, $$, escapeHtml, initPage, toast, toastOk, toastErr, fmtPrice, fmtDateTime, timeAgo,
  avatarHtml, starsHtml, showLoading, showEmpty, showError, renderProducts, renderPager,
  productCardHtml, openModal, confirmDialog, reasonDialog, reviewDialog, requireLogin,
  orderStatusTag, productStatusTag, ORDER_STATUS_LABELS, numberFmt,
} from './common.js';

initPage('me');

if (!requireLogin('请先登录后查看个人中心')) {
  throw new Error('未登录');
}

/* ======================================================================
   资料头部
   ====================================================================== */
let me = null;

function renderHeader(u) {
  $('#profileHeader').innerHTML = `
    ${avatarHtml(u, 'avatar-lg')}
    <div>
      <div class="nickname">${escapeHtml(u.nickname || u.username)}</div>
      <div class="sub">
        @${escapeHtml(u.username)}
        ${u.campus ? ' · ' + escapeHtml(u.campus) : ''}
        ${u.role === 'admin' ? ' · <span class="tag tag-sm" style="background:rgba(255,255,255,.25);color:#fff">管理员</span>' : ''}
      </div>
      <div class="sub" style="margin-top:4px">加入于 ${timeAgo(u.created_at)}</div>
    </div>
    <div class="profile-stats">
      <div><div class="num" id="statOnSale">—</div><div class="label">在售商品</div></div>
      <div><div class="num" id="statSold">—</div><div class="label">已售出</div></div>
      <div><div class="num" id="statReviews">—</div><div class="label">收到评价</div></div>
      <div><div class="num" id="statRating">—</div><div class="label">平均评分</div></div>
    </div>`;
}

async function loadMe() {
  try {
    me = await api.me();
    auth.user = me;
    renderHeader(me);
    fillProfileForm(me);
    const pub = await api.userProfile(me.id);
    const s = pub.stats || {};
    $('#statOnSale').textContent = s.on_sale ?? 0;
    $('#statSold').textContent = s.sold ?? 0;
    $('#statReviews').textContent = s.reviews ?? 0;
    $('#statRating').textContent = pub.rating_avg ? pub.rating_avg + ' ⭐' : '—';
  } catch (err) {
    toastErr(err.message);
  }
}

/* ======================================================================
   标签页
   ====================================================================== */
const loaded = {};
const TABS = ['orders', 'products', 'favorites', 'profile'];

function switchTab(name, push = true) {
  if (!TABS.includes(name)) name = 'orders';
  $$('#tabs .tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
  TABS.forEach((t) => $('#panel-' + t).classList.toggle('active', t === name));
  if (push && location.hash !== '#' + name) history.replaceState(null, '', '#' + name);

  if (!loaded[name]) {
    loaded[name] = true;
    if (name === 'orders') loadOrders();
    if (name === 'products') loadMyProducts();
    if (name === 'favorites') loadFavorites();
  }
}

$$('#tabs .tab').forEach((t) => t.addEventListener('click', () => switchTab(t.dataset.tab)));
window.addEventListener('hashchange', () => switchTab(location.hash.slice(1), false));

/* ======================================================================
   订单
   ====================================================================== */
const orderState = { role: 'all', status: '', page: 1 };
const ORDER_PAGE_SIZE = 8;

async function updateOrderSummary() {
  try {
    const s = await api.orderSummary();
    $('#orderCount').textContent = s.buyer.total + s.seller.total ? `(${s.buyer.total + s.seller.total})` : '';
    const hints = [];
    if (s.seller.pending) hints.push(`待你确认 ${s.seller.pending} 单`);
    if (s.buyer.accepted) hints.push(`待你完成 ${s.buyer.accepted} 单`);
    $('#orderHint').textContent = hints.join(' · ');
  } catch { /* 静默 */ }
}

function orderCardHtml(o) {
  const isBuyer = me && Number(o.buyer_id) === Number(me.id);
  const role = isBuyer ? 'buyer' : 'seller';
  const peer = isBuyer
    ? { id: o.seller_id, name: o.seller_nickname, avatar: o.seller_avatar }
    : { id: o.buyer_id, name: o.buyer_nickname, avatar: o.buyer_avatar };

  const actions = [];
  if (o.status === 'pending') {
    if (role === 'seller') actions.push(`<button class="btn btn-primary btn-sm" data-act="accept" data-id="${o.id}">✅ 确认接单</button>`);
    actions.push(`<button class="btn btn-default btn-sm" data-act="cancel" data-id="${o.id}">取消订单</button>`);
  } else if (o.status === 'accepted') {
    actions.push(`<button class="btn btn-success btn-sm" data-act="complete" data-id="${o.id}">🤝 标记完成</button>`);
    actions.push(`<button class="btn btn-default btn-sm" data-act="cancel" data-id="${o.id}">取消订单</button>`);
  } else if (o.status === 'completed' && !o.reviewed_by_me) {
    actions.push(`<button class="btn btn-accent btn-sm" data-act="review" data-id="${o.id}">⭐ 评价对方</button>`);
  }
  actions.push(`<button class="btn btn-ghost btn-sm" data-act="detail" data-id="${o.id}">订单详情</button>`);

  return `
  <div class="order-card">
    <div class="order-head">
      <span>订单号 <b>${escapeHtml(o.order_no)}</b> · ${timeAgo(o.created_at)}</span>
      <span class="row-center" style="gap:8px">
        <span class="tag ${role === 'buyer' ? 'tag-primary' : 'tag-accent'}">${role === 'buyer' ? '我买到的' : '我卖出的'}</span>
        ${orderStatusTag(o.status)}
      </span>
    </div>
    <div class="order-body">
      ${o.cover_snapshot
        ? `<a href="product.html?id=${o.product_id}"><img class="order-thumb" src="${escapeHtml(o.cover_snapshot)}" alt=""></a>`
        : `<div class="order-thumb"></div>`}
      <div style="flex:1;min-width:0">
        <a href="product.html?id=${o.product_id}" class="fw-600" style="font-size:15px">${escapeHtml(o.title_snapshot)}</a>
        <div class="row-center mt-8" style="gap:16px;font-size:13px;color:var(--text-secondary);flex-wrap:wrap">
          <span>金额 <b style="color:#ef4444">¥${fmtPrice(o.amount)}</b></span>
          <span>${role === 'buyer' ? '卖家' : '买家'}：${escapeHtml(peer.name || '同学')}</span>
          ${o.trade_place ? `<span>📍 ${escapeHtml(o.trade_place)}</span>` : ''}
          ${o.trade_time ? `<span>🕐 ${escapeHtml(o.trade_time)}</span>` : ''}
        </div>
        ${o.cancel_reason ? `<div class="text-muted" style="font-size:12px;margin-top:4px">取消原因：${escapeHtml(o.cancel_reason)}</div>` : ''}
      </div>
      ${avatarHtml({ nickname: peer.name, avatar: peer.avatar })}
    </div>
    <div class="order-foot">${actions.join('')}</div>
  </div>`;
}

async function loadOrders() {
  const box = $('#orderList');
  showLoading(box);
  updateOrderSummary();
  try {
    const data = await api.orders({ ...orderState, size: ORDER_PAGE_SIZE });
    if (!data.items.length) {
      showEmpty(box, {
        emoji: '📦',
        title: '还没有订单',
        desc: orderState.role === 'seller' ? '暂时没有人下单你的商品' : '去逛逛，找找心仪的闲置吧',
        action: '<a class="btn btn-primary" href="index.html">去逛逛</a>',
      });
      renderPager($('#orderPager'), {}, null);
      return;
    }
    box.innerHTML = data.items.map(orderCardHtml).join('');
    bindOrderActions();
    renderPager($('#orderPager'), data, (p) => { orderState.page = p; loadOrders(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
  } catch (err) {
    showError(box, err);
  }
}

function bindOrderActions() {
  $$('#orderList [data-act]').forEach((b) =>
    b.addEventListener('click', async () => {
      const id = b.dataset.id;
      const act = b.dataset.act;
      if (act === 'detail') return showOrderDetail(id);
      if (act === 'accept') {
        if (!(await confirmDialog({ title: '确认接单', message: '确认后买家会收到通知，商品将标记为「已预订」。', okText: '确认接单' }))) return;
        return doOrderAction(id, 'accept');
      }
      if (act === 'complete') {
        if (!(await confirmDialog({ title: '标记交易完成', message: '确认已经完成面交？商品将标记为「已售出」，双方可以互相评价。', okText: '已完成' }))) return;
        return doOrderAction(id, 'complete');
      }
      if (act === 'cancel') {
        const reason = await reasonDialog({ title: '取消订单', placeholder: '取消原因（选填）', okText: '确认取消' });
        if (reason === null) return;
        return doOrderAction(id, 'cancel', reason);
      }
      if (act === 'review') {
        const r = await reviewDialog({ title: '评价交易对象' });
        if (!r) return;
        try {
          await api.reviewOrder(id, r);
          toastOk('评价成功，感谢你的反馈！');
          loadOrders();
        } catch (err) { toastErr(err.message); }
      }
    }));
}

async function doOrderAction(id, action, reason) {
  try {
    const res = await api.orderAction(id, action, reason);
    toastOk(res.message || '操作成功');
    loadOrders();
  } catch (err) {
    toastErr(err.message);
  }
}

async function showOrderDetail(id) {
  let o;
  try {
    o = await api.order(id);
  } catch (err) {
    return toastErr(err.message);
  }
  const isBuyer = Number(o.buyer_id) === Number(me.id);
  const peer = isBuyer
    ? { id: o.seller_id, name: o.seller_nickname, avatar: o.seller_avatar }
    : { id: o.buyer_id, name: o.buyer_nickname, avatar: o.buyer_avatar };

  const reviews = (o.reviews || []).map((r) => `
    <div class="review-item">
      <div class="row-between">
        <span class="fw-600">${escapeHtml(r.from_nickname)}</span>
        <span class="text-muted" style="font-size:12px">${fmtDateTime(r.created_at)}</span>
      </div>
      <div class="mt-8">${starsHtml(r.rating)}</div>
      <div class="text-secondary mt-8">${escapeHtml(r.content || '')}</div>
    </div>`).join('');

  openModal({
    title: '订单详情',
    size: 'modal-lg',
    body: `
      <div class="msg-product">
        ${o.cover_snapshot ? `<img src="${escapeHtml(o.cover_snapshot)}" alt="">` : ''}
        <div style="flex:1;min-width:0">
          <div class="ellipsis fw-600">${escapeHtml(o.title_snapshot)}</div>
          <div style="color:#ef4444;font-weight:700">¥${fmtPrice(o.amount)}</div>
        </div>
        ${orderStatusTag(o.status)}
      </div>
      <div class="detail-attrs" style="font-size:13px">
        <div class="detail-attr"><span class="k">订单号</span><span class="v">${escapeHtml(o.order_no)}</span></div>
        <div class="detail-attr"><span class="k">买家</span><span class="v">${escapeHtml(o.buyer_nickname)}</span></div>
        <div class="detail-attr"><span class="k">卖家</span><span class="v">${escapeHtml(o.seller_nickname)}</span></div>
        <div class="detail-attr"><span class="k">下单时间</span><span class="v">${fmtDateTime(o.created_at)}</span></div>
        <div class="detail-attr"><span class="k">交易地点</span><span class="v">${escapeHtml(o.trade_place || '面议')}</span></div>
        <div class="detail-attr"><span class="k">交易时间</span><span class="v">${escapeHtml(o.trade_time || '面议')}</span></div>
        ${o.remark ? `<div class="detail-attr"><span class="k">买家留言</span><span class="v">${escapeHtml(o.remark)}</span></div>` : ''}
        ${o.accepted_at ? `<div class="detail-attr"><span class="k">接单时间</span><span class="v">${fmtDateTime(o.accepted_at)}</span></div>` : ''}
        ${o.completed_at ? `<div class="detail-attr"><span class="k">完成时间</span><span class="v">${fmtDateTime(o.completed_at)}</span></div>` : ''}
        ${o.cancel_reason ? `<div class="detail-attr"><span class="k">取消原因</span><span class="v">${escapeHtml(o.cancel_reason)}</span></div>` : ''}
      </div>
      <hr style="border:0;border-top:1px solid var(--border);margin:16px 0">
      <h3 class="mb-16">评价（${(o.reviews || []).length}）</h3>
      ${reviews || '<div class="text-muted">暂无评价</div>'}`,
    foot: `<button class="btn btn-default" data-no>关闭</button>
           <button class="btn btn-primary" data-chat>💬 联系${isBuyer ? '卖家' : '买家'}</button>`,
    onMount(mask, close) {
      $('[data-no]', mask).addEventListener('click', close);
      $('[data-chat]', mask).addEventListener('click', () => {
        close();
        location.href = `messages.html?peer_id=${peer.id}&product_id=${o.product_id}`;
      });
    },
  });
}

/* ---- 订单筛选 ---- */
$$('#roleFilter .sort-btn').forEach((b) =>
  b.addEventListener('click', () => {
    orderState.role = b.dataset.role;
    orderState.page = 1;
    $$('#roleFilter .sort-btn').forEach((x) => x.classList.toggle('active', x === b));
    loadOrders();
  }));
$('#orderStatus').addEventListener('change', (e) => {
  orderState.status = e.target.value;
  orderState.page = 1;
  loadOrders();
});

/* ======================================================================
   我发布的商品
   ====================================================================== */
const myProductState = { status: 'all', page: 1 };
const MY_PAGE_SIZE = 10;

function myProductRow(p) {
  return `
  <div class="list-row">
    <a href="product.html?id=${p.id}">
      ${p.cover ? `<img class="thumb" src="${escapeHtml(p.cover)}" alt="">` : `<div class="thumb"></div>`}
    </a>
    <div style="flex:1;min-width:0">
      <a href="product.html?id=${p.id}" class="fw-600">${escapeHtml(p.title)}</a>
      <div class="row-center mt-8" style="gap:12px;font-size:12px;color:var(--text-muted);flex-wrap:wrap">
        <span style="color:#ef4444;font-weight:700;font-size:15px">¥${fmtPrice(p.price)}</span>
        <span>${productStatusTag(p.status)}</span>
        <span>👁 ${p.view_count}</span>
        <span>❤️ ${p.favorite_count}</span>
        <span>${timeAgo(p.created_at)}</span>
      </div>
    </div>
    <div class="row-center" style="gap:6px;flex-shrink:0">
      <a class="btn btn-default btn-sm" href="publish.html?id=${p.id}">编辑</a>
      ${p.status === 'on_sale'
        ? `<button class="btn btn-default btn-sm" data-pact="off_shelf" data-id="${p.id}">下架</button>`
        : p.status === 'sold'
          ? ''
          : `<button class="btn btn-default btn-sm" data-pact="on_sale" data-id="${p.id}">上架</button>`}
      <button class="btn btn-danger btn-sm" data-pact="delete" data-id="${p.id}">删除</button>
    </div>
  </div>`;
}

async function loadMyProducts() {
  const box = $('#myProductList');
  showLoading(box);
  try {
    const data = await api.myProducts({ ...myProductState, size: MY_PAGE_SIZE });
    $('#productCount').textContent = data.total ? `(${data.total})` : '';
    if (!data.items.length) {
      showEmpty(box, {
        emoji: '📋',
        title: '还没有发布商品',
        desc: '把闲置的教材、数码、生活用品挂上来吧',
        action: '<a class="btn btn-primary" href="publish.html">＋ 发布闲置</a>',
      });
      renderPager($('#myProductPager'), {}, null);
      return;
    }
    box.innerHTML = `<div class="card">${data.items.map(myProductRow).join('')}</div>`;
    bindMyProductActions();
    renderPager($('#myProductPager'), data, (p) => { myProductState.page = p; loadMyProducts(); });
  } catch (err) {
    showError(box, err);
  }
}

function bindMyProductActions() {
  $$('#myProductList [data-pact]').forEach((b) =>
    b.addEventListener('click', async () => {
      const id = b.dataset.id;
      const act = b.dataset.pact;
      if (act === 'delete') {
        if (!(await confirmDialog({ title: '删除商品', message: '删除后不可恢复，确定要删除吗？', okText: '删除', danger: true }))) return;
        try {
          await api.deleteProduct(id);
          toastOk('商品已删除');
          loadMyProducts();
        } catch (err) { toastErr(err.message); }
        return;
      }
      const label = act === 'on_sale' ? '上架' : '下架';
      try {
        await api.setProductStatus(id, act);
        toastOk(`已${label}`);
        loadMyProducts();
      } catch (err) { toastErr(err.message); }
    }));
}

$$('#productStatusFilter .sort-btn').forEach((b) =>
  b.addEventListener('click', () => {
    myProductState.status = b.dataset.status;
    myProductState.page = 1;
    $$('#productStatusFilter .sort-btn').forEach((x) => x.classList.toggle('active', x === b));
    loadMyProducts();
  }));

/* ======================================================================
   我的收藏
   ====================================================================== */
const favState = { page: 1 };
const FAV_PAGE_SIZE = 12;

async function loadFavorites() {
  const box = $('#favGrid');
  showLoading(box);
  try {
    const data = await api.favorites({ ...favState, size: FAV_PAGE_SIZE });
    $('#favCount').textContent = data.total ? `(${data.total})` : '';
    if (!data.items.length) {
      showEmpty(box, {
        emoji: '🤍',
        title: '还没有收藏任何商品',
        desc: '看到喜欢的商品点个心心，方便以后找到',
        action: '<a class="btn btn-primary" href="index.html">去逛逛</a>',
      });
      box.style.display = 'block';
      renderPager($('#favPager'), {}, null);
      return;
    }
    box.style.display = '';
    renderProducts(box, data.items);
    renderPager($('#favPager'), data, (p) => { favState.page = p; loadFavorites(); });
  } catch (err) {
    showError(box, err);
  }
}

// 在收藏页取消收藏后自动刷新
document.addEventListener('favorite-change', (e) => {
  if (loaded.favorites && !e.detail.favorited) setTimeout(loadFavorites, 600);
});

/* ======================================================================
   账号资料
   ====================================================================== */
function fillProfileForm(u) {
  $('#pUsername').value = u.username || '';
  $('#pNickname').value = u.nickname || '';
  $('#pEmail').value = u.email || '';
  $('#pPhone').value = u.phone || '';
  $('#pCampus').value = u.campus || '';
  $('#pBio').value = u.bio || '';
  $('#avatarPreview').innerHTML = avatarHtml(u, 'avatar-lg');
}

$('#saveProfileBtn').addEventListener('click', async () => {
  const err = $('#profileError');
  err.textContent = '';
  const nickname = $('#pNickname').value.trim();
  const email = $('#pEmail').value.trim();
  if (nickname.length < 2 || nickname.length > 20) { err.textContent = '昵称长度需在 2-20 个字符之间'; return; }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { err.textContent = '请输入有效的邮箱地址'; return; }

  const btn = $('#saveProfileBtn');
  btn.disabled = true;
  btn.textContent = '保存中…';
  try {
    const updated = await api.updateMe({
      nickname,
      email: email || null,
      phone: $('#pPhone').value.trim() || null,
      campus: $('#pCampus').value.trim() || null,
      bio: $('#pBio').value.trim() || null,
    });
    me = updated;
    auth.user = updated;
    renderHeader(updated);
    fillProfileForm(updated);
    toastOk('资料已保存');
    // 顶栏昵称可能变化，刷新一次
    setTimeout(() => location.reload(), 700);
  } catch (e2) {
    err.textContent = e2.message;
  } finally {
    btn.disabled = false;
    btn.textContent = '保存资料';
  }
});

/* ---- 头像上传 ---- */
$('#changeAvatarBtn').addEventListener('click', () => $('#avatarInput').click());
$('#avatarInput').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) return toastErr('图片不能超过 5 MB');
  try {
    const { url } = await api.upload(file);
    const updated = await api.updateMe({ avatar: url });
    me = updated;
    auth.user = updated;
    renderHeader(updated);
    fillProfileForm(updated);
    toastOk('头像已更新');
  } catch (err) {
    toastErr(err.message);
  }
});

/* ---- 修改密码 ---- */
$('#changePwdBtn').addEventListener('click', async () => {
  const err = $('#pwdError');
  err.textContent = '';
  const oldPwd = $('#oldPassword').value;
  const newPwd = $('#newPassword').value;
  const newPwd2 = $('#newPassword2').value;
  if (!oldPwd) { err.textContent = '请输入当前密码'; return; }
  if (newPwd.length < 6) { err.textContent = '新密码至少 6 位'; return; }
  if (newPwd !== newPwd2) { err.textContent = '两次输入的新密码不一致'; return; }

  const btn = $('#changePwdBtn');
  btn.disabled = true;
  btn.textContent = '提交中…';
  try {
    await api.changePassword({ old_password: oldPwd, new_password: newPwd });
    toastOk('密码已修改，请重新登录');
    auth.clear();
    setTimeout(() => (location.href = 'login.html'), 1200);
  } catch (e2) {
    err.textContent = e2.message;
    btn.disabled = false;
    btn.textContent = '修改密码';
  }
});

/* ======================================================================
   启动
   ====================================================================== */
await loadMe();
switchTab(location.hash.slice(1) || 'orders', false);
// 无论如何都先拉一次订单角标
updateOrderSummary();

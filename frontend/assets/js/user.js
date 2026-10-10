/* ==========================================================================
   user.js —— 他人公开主页
   ========================================================================== */
import api, { auth } from './api.js';
import {
  $, $$, escapeHtml, initPage, toastErr, avatarHtml, starsHtml, fmtDateTime, timeAgo,
  showLoading, showEmpty, showError, renderProducts, renderPager, getQuery,
} from './common.js';

initPage('');

const uid = Number(getQuery('id'));
const productState = { page: 1 };
const reviewState = { page: 1 };

let profile = null;

/* ======================================================================
   头部
   ====================================================================== */
async function loadProfile() {
  const box = $('#userHeader');
  if (!uid) { showError(box, { message: '缺少用户 ID' }); return; }
  try {
    profile = await api.userProfile(uid);
    document.title = (profile.nickname || profile.username) + ' 的主页 · 校园集市';
    const isMe = auth.user && Number(auth.user.id) === uid;
    const s = profile.stats || {};

    box.innerHTML = `
      <div class="profile-header">
        ${avatarHtml(profile, 'avatar-lg')}
        <div>
          <div class="nickname">${escapeHtml(profile.nickname || profile.username)}</div>
          <div class="sub">
            @${escapeHtml(profile.username)}
            ${profile.campus ? ' · ' + escapeHtml(profile.campus) : ''}
          </div>
          ${profile.bio ? `<div class="sub" style="margin-top:6px;max-width:420px">${escapeHtml(profile.bio)}</div>` : ''}
          <div class="sub" style="margin-top:4px">
            加入于 ${timeAgo(profile.created_at)}
            ${profile.rating_avg ? ` · ⭐ ${profile.rating_avg} 分` : ''}
          </div>
        </div>
        <div class="profile-stats">
          <div><div class="num">${s.on_sale ?? 0}</div><div class="label">在售商品</div></div>
          <div><div class="num">${s.sold ?? 0}</div><div class="label">已售出</div></div>
          <div><div class="num">${s.reviews ?? 0}</div><div class="label">收到评价</div></div>
        </div>
        ${isMe ? '<a class="btn btn-default" href="me.html">编辑我的资料</a>'
               : `<button class="btn btn-primary" id="chatBtn">💬 联系 TA</button>`}
      </div>`;

    $('#chatBtn')?.addEventListener('click', () => {
      if (!auth.isLogin) {
        location.href = 'login.html?redirect=' + encodeURIComponent(location.pathname + location.search);
        return;
      }
      location.href = 'messages.html?peer_id=' + uid;
    });

    loadProducts();
    loadReviews();
  } catch (err) {
    showError(box, err, '<a class="btn btn-default" href="index.html">返回首页</a>');
  }
}

/* ======================================================================
   在售商品
   ====================================================================== */
async function loadProducts() {
  const box = $('#userProducts');
  showLoading(box);
  try {
    const data = await api.userProducts(uid, { ...productState, size: 12 });
    if (!data.items.length) {
      showEmpty(box, { emoji: '🛍', title: 'TA 暂时没有在售商品' });
      renderPager($('#userProductPager'), {}, null);
      return;
    }
    renderProducts(box, data.items);
    renderPager($('#userProductPager'), data, (p) => { productState.page = p; loadProducts(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
  } catch (err) {
    showError(box, err);
  }
}

/* ======================================================================
   评价
   ====================================================================== */
async function loadReviews() {
  const box = $('#userReviews');
  showLoading(box);
  try {
    const data = await api.userReviews(uid, { ...reviewState, size: 10 });
    if (!data.items.length) {
      box.innerHTML = `<div class="empty"><div class="emoji">⭐</div>
        <div class="title">还没有收到评价</div></div>`;
      renderPager($('#userReviewPager'), {}, null);
      return;
    }
    box.innerHTML = data.items.map((r) => `
      <div class="review-item">
        <div class="row-between">
          <div class="row-center" style="gap:8px">
            ${avatarHtml({ nickname: r.from_nickname, avatar: r.from_avatar }, 'avatar-sm')}
            <span class="fw-600">${escapeHtml(r.from_nickname || '匿名同学')}</span>
            <span class="text-muted" style="font-size:12px">${starsHtml(r.rating)}</span>
          </div>
          <span class="text-muted" style="font-size:12px">${fmtDateTime(r.created_at)}</span>
        </div>
        <div class="text-secondary mt-8">${escapeHtml(r.content || '')}</div>
        ${r.product_title ? `<div class="text-muted" style="font-size:12px;margin-top:6px">
          交易商品：<a href="product.html?id=${r.product_id}">${escapeHtml(r.product_title)}</a>
          ${r.order_no ? ` · 订单 ${escapeHtml(r.order_no)}` : ''}</div>` : ''}
      </div>`).join('');
    renderPager($('#userReviewPager'), data, (p) => { reviewState.page = p; loadReviews(); });
  } catch (err) {
    showError(box, err);
  }
}

/* ======================================================================
   标签页
   ====================================================================== */
$$('#tabs .tab').forEach((t) =>
  t.addEventListener('click', () => {
    $$('#tabs .tab').forEach((x) => x.classList.toggle('active', x === t));
    ['products', 'reviews'].forEach((n) => $('#panel-' + n).classList.toggle('active', n === t.dataset.tab));
  }));

loadProfile();

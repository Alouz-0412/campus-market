/* ==========================================================================
   product.js —— 商品详情页
   ========================================================================== */
import api, { auth } from './api.js';
import {
  $, $$, escapeHtml, initPage, toast, toastOk, toastErr, fmtPrice, fmtDateTime,
  avatarHtml, starsHtml, showError, productCardHtml, openModal, confirmDialog,
  CONDITION_LABELS, PRODUCT_STATUS_LABELS, getQuery, timeAgo, requireLogin,
} from './common.js';

initPage('');

const pid = Number(getQuery('id'));
const root = $('#detailRoot');

async function load() {
  if (!pid) {
    showError(root, { message: '缺少商品 ID' });
    return;
  }
  try {
    const p = await api.product(pid);
    document.title = p.title + ' · 校园集市';
    $('#crumb').textContent = p.category_name || '商品详情';
    render(p);
    loadSellerProducts(p.seller_id, p.id);
    if (p.seller) loadSellerReviews(p.seller.id);
  } catch (err) {
    showError(root, err, '<a class="btn btn-default" href="index.html">返回首页</a>');
  }
}

/* ---------------------------- 详情渲染 ---------------------------- */
function render(p) {
  const mine = auth.user && Number(auth.user.id) === Number(p.seller_id);
  const images = p.images && p.images.length ? p.images : [];
  const coverFallback = `<div class="placeholder">${escapeHtml(p.category_icon || '📦')}</div>`;

  const statusBanner = {
    reserved: '<span class="tag tag-warning">该商品已被预订</span>',
    sold: '<span class="tag">该商品已售出</span>',
    off_shelf: '<span class="tag">该商品已下架</span>',
  }[p.status] || '<span class="tag tag-success">在售中</span>';

  root.innerHTML = `
    <div class="detail-grid">
      <!-- 图集 -->
      <div>
        <div class="gallery">
          <div class="gallery-main" id="mainImage">
            ${images.length ? `<img src="${escapeHtml(images[0])}" alt="${escapeHtml(p.title)}">` : coverFallback}
          </div>
          ${images.length > 1 ? `<div class="gallery-thumbs" id="thumbs">
            ${images.map((u, i) => `<img src="${escapeHtml(u)}" data-i="${i}" class="${i === 0 ? 'active' : ''}">`).join('')}
          </div>` : ''}
        </div>

        <div class="card card-pad mt-16">
          <h3 class="mb-16">商品描述</h3>
          <div class="desc-box">${escapeHtml(p.description || '卖家很懒，什么都没写～')}</div>
        </div>
      </div>

      <!-- 信息 -->
      <div class="detail-info">
        <div class="card card-pad">
          <div class="row-between" style="align-items:flex-start">
            <h1 style="font-size:20px;flex:1">${escapeHtml(p.title)}</h1>
          </div>
          <div class="row-center wrap mt-8" style="gap:8px">
            ${statusBanner}
            <span class="tag tag-primary">${escapeHtml(p.category_icon || '')} ${escapeHtml(p.category_name || '')}</span>
            <span class="tag tag-violet">${escapeHtml(CONDITION_LABELS[p.condition_level] || '未知成色')}</span>
          </div>
        </div>

        <div class="detail-price-box">
          <div class="detail-price"><span class="unit">¥</span>${fmtPrice(p.price)}
            ${p.original_price ? `<span class="orig">原价 ¥${fmtPrice(p.original_price)}</span>` : ''}
          </div>
          <div class="row-center mt-8" style="gap:18px;font-size:13px;color:var(--text-secondary)">
            <span>👁 ${p.view_count} 次浏览</span>
            <span>❤️ ${p.favorite_count} 人收藏</span>
          </div>
        </div>

        <div class="card card-pad">
          <div class="detail-attrs">
            <div class="detail-attr"><span class="k">交易地点</span><span class="v">${escapeHtml(p.trade_place || '面议')}</span></div>
            <div class="detail-attr"><span class="k">发布时间</span><span class="v">${fmtDateTime(p.created_at)}（${timeAgo(p.created_at)}）</span></div>
            <div class="detail-attr"><span class="k">商品编号</span><span class="v text-muted">#${p.id}</span></div>
          </div>
        </div>

        <div class="seller-box">
          ${avatarHtml(p.seller)}
          <div style="flex:1;min-width:0">
            <div class="row-center" style="gap:8px">
              <a href="user.html?id=${p.seller_id}" class="fw-600" style="font-size:15px">${escapeHtml(p.seller?.nickname || '同学')}</a>
              ${p.seller?.campus ? `<span class="tag tag-sm">${escapeHtml(p.seller.campus)}</span>` : ''}
            </div>
            <div class="text-muted" style="font-size:12px">
              ${p.seller?.rating_avg ? `⭐ ${p.seller.rating_avg} 分 · ${p.seller.rating_count} 条评价` : '暂无评价'}
              · 在售 ${p.seller_product_count} 件
            </div>
          </div>
          <a class="btn btn-default btn-sm" href="user.html?id=${p.seller_id}">TA 的主页</a>
        </div>

        <div class="detail-actions">
          ${mine ? `
            <button class="btn btn-primary" id="btnEdit">✏️ 编辑商品</button>
            ${p.status === 'on_sale'
              ? '<button class="btn btn-default" id="btnOff">⬇️ 下架</button>'
              : '<button class="btn btn-default" id="btnOn">⬆️ 重新上架</button>'}
            <button class="btn btn-danger" id="btnDelete">🗑 删除</button>
          ` : `
            <button class="btn btn-primary btn-lg" id="btnOrder" ${p.status !== 'on_sale' ? 'disabled' : ''}>
              ${p.status === 'on_sale' ? '🛒 我想要，去下单' : PRODUCT_STATUS_LABELS[p.status]}
            </button>
            <button class="btn btn-accent btn-lg" id="btnChat">💬 联系卖家</button>
            <button class="btn btn-default btn-lg" id="btnFav">${p.is_favorited ? '❤️ 已收藏' : '🤍 收藏'}</button>
          `}
        </div>
      </div>
    </div>

    <!-- 卖家其他商品 -->
    <section class="mt-24">
      <div class="row-between mb-16">
        <h2>TA 的其他闲置</h2>
        <a href="user.html?id=${p.seller_id}" class="text-secondary" style="font-size:13px">查看全部 →</a>
      </div>
      <div class="product-grid" id="sellerProducts"></div>
    </section>

    <!-- 卖家评价 -->
    <section class="mt-24">
      <div class="row-between mb-16">
        <h2>卖家评价 <span class="text-muted" id="reviewCount" style="font-size:14px;font-weight:400"></span></h2>
      </div>
      <div class="card card-pad" id="sellerReviews"><div class="text-muted">暂无评价</div></div>
    </section>`;

  /* 图集切换 */
  const thumbs = $('#thumbs');
  if (thumbs) {
    $$('img', thumbs).forEach((t) =>
      t.addEventListener('click', () => {
        $('#mainImage').innerHTML = `<img src="${escapeHtml(images[Number(t.dataset.i)])}" alt="">`;
        $$('img', thumbs).forEach((x) => x.classList.remove('active'));
        t.classList.add('active');
      }));
  }

  bindActions(p, mine);
}

/* ---------------------------- 操作 ---------------------------- */
function bindActions(p, mine) {
  if (mine) {
    $('#btnEdit')?.addEventListener('click', () => (location.href = 'publish.html?id=' + p.id));

    $('#btnOff')?.addEventListener('click', async () => {
      if (!(await confirmDialog({ title: '下架商品', message: '下架后买家将无法搜索到该商品，可随时重新上架。', okText: '确认下架' }))) return;
      await doStatus(p, 'off_shelf', '商品已下架');
    });

    $('#btnOn')?.addEventListener('click', () => doStatus(p, 'on_sale', '商品已重新上架'));

    $('#btnDelete')?.addEventListener('click', async () => {
      if (!(await confirmDialog({ title: '删除商品', message: '删除后不可恢复，确定要删除这件商品吗？', okText: '删除', danger: true }))) return;
      try {
        await api.deleteProduct(p.id);
        toastOk('商品已删除');
        setTimeout(() => (location.href = 'me.html#products'), 700);
      } catch (err) { toastErr(err.message); }
    });
    return;
  }

  /* 收藏 */
  $('#btnFav')?.addEventListener('click', async () => {
    if (!requireLogin()) return;
    try {
      const r = await api.toggleFavorite(p.id);
      toast(r.favorited ? '已加入收藏' : '已取消收藏', r.favorited ? 'success' : '');
      const btn = $('#btnFav');
      btn.textContent = r.favorited ? '❤️ 已收藏' : '🤍 收藏';
    } catch (err) { toastErr(err.message); }
  });

  /* 联系卖家 */
  $('#btnChat')?.addEventListener('click', () => {
    if (!requireLogin()) return;
    location.href = `messages.html?peer_id=${p.seller_id}&product_id=${p.id}`;
  });

  /* 下单 */
  $('#btnOrder')?.addEventListener('click', () => {
    if (!requireLogin()) return;
    openOrderModal(p);
  });
}

async function doStatus(p, status, okMsg) {
  try {
    await api.setProductStatus(p.id, status);
    toastOk(okMsg);
    setTimeout(() => location.reload(), 700);
  } catch (err) { toastErr(err.message); }
}

/* ---------------------------- 下单弹窗 ---------------------------- */
function openOrderModal(p) {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const defTime = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:00`;

  openModal({
    title: '确认下单',
    body: `
      <div class="msg-product">
        ${p.cover ? `<img src="${escapeHtml(p.cover)}" alt="">` : ''}
        <div style="flex:1;min-width:0">
          <div class="ellipsis fw-600">${escapeHtml(p.title)}</div>
          <div style="color:#ef4444;font-weight:700">¥${fmtPrice(p.price)}</div>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">期望交易地点</label>
        <input class="input" id="oTradePlace" placeholder="如：图书馆一楼大厅" value="${escapeHtml(p.trade_place || '')}" maxlength="60">
      </div>
      <div class="form-group">
        <label class="form-label">期望交易时间</label>
        <input class="input" id="oTradeTime" type="datetime-local" value="${defTime}">
      </div>
      <div class="form-group" style="margin-bottom:0">
        <label class="form-label">给卖家留言</label>
        <textarea class="textarea" id="oRemark" maxlength="200" placeholder="选填，例如：我今晚有空，方便的话图书馆见～"></textarea>
      </div>
      <div class="form-hint mt-8">提交后卖家会收到通知，确认后即可完成交易。</div>`,
    foot: `<button class="btn btn-default" data-no>再想想</button>
           <button class="btn btn-primary" data-yes>提交订单</button>`,
    onMount(mask, close) {
      $('[data-no]', mask).addEventListener('click', close);
      $('[data-yes]', mask).addEventListener('click', async (e) => {
        const btn = e.target;
        btn.disabled = true;
        btn.textContent = '提交中…';
        try {
          const tm = $('#oTradeTime', mask).value.replace('T', ' ');
          const res = await api.createOrder({
            product_id: p.id,
            trade_place: $('#oTradePlace', mask).value.trim() || null,
            trade_time: tm || null,
            remark: $('#oRemark', mask).value.trim() || null,
          });
          close();
          toastOk('下单成功！等待卖家确认');
          setTimeout(() => (location.href = 'me.html#orders'), 900);
        } catch (err) {
          toastErr(err.message);
          btn.disabled = false;
          btn.textContent = '提交订单';
        }
      });
    },
  });
}

/* ---------------------------- 卖家其他商品 ---------------------------- */
async function loadSellerProducts(sellerId, excludeId) {
  const box = $('#sellerProducts');
  try {
    const data = await api.products({ seller_id: sellerId, status: 'active', size: 5, sort: 'latest' });
    const items = data.items.filter((x) => x.id !== excludeId).slice(0, 4);
    if (!items.length) {
      box.innerHTML = '<div class="text-muted">TA 暂时没有其他在售商品</div>';
      return;
    }
    box.innerHTML = items.map(productCardHtml).join('');
  } catch {
    box.innerHTML = '';
  }
}

/* ---------------------------- 卖家评价 ---------------------------- */
async function loadSellerReviews(sellerId) {
  const box = $('#sellerReviews');
  try {
    const data = await api.userReviews(sellerId, { size: 3, page: 1 });
    if (!data.items.length) {
      box.innerHTML = '<div class="text-muted">还没有收到评价</div>';
      return;
    }
    $('#reviewCount').textContent = `（共 ${data.total} 条）`;
    box.innerHTML = data.items.map((r) => `
      <div class="review-item">
        <div class="row-between">
          <div class="row-center" style="gap:8px">
            ${avatarHtml({ nickname: r.from_nickname, avatar: r.from_avatar }, 'avatar-sm')}
            <span class="fw-600">${escapeHtml(r.from_nickname || '匿名同学')}</span>
          </div>
          <span class="text-muted" style="font-size:12px">${timeAgo(r.created_at)}</span>
        </div>
        <div class="mt-8">${starsHtml(r.rating)}</div>
        <div class="text-secondary mt-8">${escapeHtml(r.content || '')}</div>
      </div>`).join('');
  } catch {
    box.innerHTML = '<div class="text-muted">评价加载失败</div>';
  }
}

load();

/* ==========================================================================
   home.js —— 首页：分类 / 筛选 / 排序 / 搜索 / 分页
   ========================================================================== */
import api, { auth } from './api.js';
import {
  $, $$, escapeHtml, initPage, renderProducts, renderPager, showLoading, showError,
  toastErr, numberFmt, getQuery, CONDITION_LABELS, productCardHtml, requireLogin,
} from './common.js';

initPage('home');

const PAGE_SIZE = 12;

/* ---------- 状态（与 URL 同步） ---------- */
const state = {
  keyword: getQuery('keyword'),
  category_id: getQuery('category_id'),
  condition_level: getQuery('condition_level'),
  min_price: getQuery('min_price'),
  max_price: getQuery('max_price'),
  sort: getQuery('sort') || 'latest',
  page: Number(getQuery('page', '1')) || 1,
};

/* ---------- 同校区优先 ---------- */
const CAMPUS_KEY = 'cm_campus_first';
const myCampus = auth.user?.campus || '';
const readSaved = () => { try { return localStorage.getItem(CAMPUS_KEY); } catch { return null; } };
const writeSaved = (v) => { try { localStorage.setItem(CAMPUS_KEY, v); } catch { /* 隐私模式忽略 */ } };

/** 优先级：URL 显式指定 > 上次记住的选择 > 有校区则默认开启 */
function resolveCampusFirst() {
  const q = getQuery('campus_first');
  if (q === '1' || q === '0') return q === '1';
  const saved = readSaved();
  if (saved === '1' || saved === '0') return saved === '1';
  return !!myCampus;
}
state.campus_first = !!myCampus && resolveCampusFirst();

function pushUrl(replace = false) {
  const qs = new URLSearchParams();
  Object.entries(state).forEach(([k, v]) => {
    if (k === 'campus_first') return;
    if (v !== '' && v !== undefined && v !== null && !(k === 'page' && Number(v) === 1) && !(k === 'sort' && v === 'latest')) {
      qs.set(k, v);
    }
  });
  if (state.campus_first) qs.set('campus_first', '1');
  const url = location.pathname + (qs.toString() ? '?' + qs.toString() : '');
  history[replace ? 'replaceState' : 'pushState'](null, '', url);
}

const hasFilter = () =>
  !!(state.keyword || state.category_id || state.condition_level || state.min_price || state.max_price);

/* ---------- 分类 ---------- */
let categories = [];

async function loadCategories() {
  const box = $('#categoryGrid');
  try {
    const { items } = await api.categories();
    categories = items;
    const allActive = !state.category_id;
    box.innerHTML =
      `<div class="category-item ${allActive ? 'active' : ''}" data-cid="">
         <span class="emoji">🏫</span><span class="name">全部</span>
         <span class="count">${numberFmt(items.reduce((s, c) => s + Number(c.product_count || 0), 0))} 件</span>
       </div>` +
      items.map((c) => `
        <div class="category-item ${String(state.category_id) === String(c.id) ? 'active' : ''}" data-cid="${c.id}">
          <span class="emoji">${escapeHtml(c.icon || '📦')}</span>
          <span class="name">${escapeHtml(c.name)}</span>
          <span class="count">${c.product_count} 件</span>
        </div>`).join('');

    $$('.category-item', box).forEach((el) =>
      el.addEventListener('click', () => {
        state.category_id = el.dataset.cid;
        state.page = 1;
        loadCategories();
        loadProducts();
        pushUrl();
      }));
  } catch (err) {
    box.innerHTML = `<div class="text-muted">分类加载失败：${escapeHtml(err.message)}</div>`;
  }
}

/* ---------- 成色筛选 ---------- */
function renderConditionFilter() {
  const box = $('#conditionFilter');
  const opts = [['', '不限']].concat(Object.entries(CONDITION_LABELS));
  box.innerHTML = opts
    .map(([v, label]) => `<div class="filter-item ${String(state.condition_level) === String(v) ? 'active' : ''}" data-c="${v}">
        <span>${escapeHtml(label)}</span>${state.condition_level === v ? '<span>✓</span>' : ''}
      </div>`)
    .join('');
  $$('.filter-item', box).forEach((el) =>
    el.addEventListener('click', () => {
      state.condition_level = el.dataset.c;
      state.page = 1;
      renderConditionFilter();
      loadProducts();
      pushUrl();
    }));
}

/* ---------- 排序 ---------- */
function renderSort() {
  $$('#sortGroup .sort-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.sort === state.sort);
    b.onclick = () => {
      state.sort = b.dataset.sort;
      state.page = 1;
      renderSort();
      loadProducts();
      pushUrl();
    };
  });
}

/* ---------- 商品列表 ---------- */
async function loadProducts() {
  const grid = $('#productGrid');
  showLoading(grid);

  $('#hero').classList.toggle('hidden', hasFilter());
  $('#listTitle').textContent = state.keyword
    ? `“${state.keyword}” 的搜索结果`
    : state.category_id
      ? (categories.find((c) => String(c.id) === String(state.category_id))?.name || '商品列表')
      : state.campus_first
        ? `🏫 ${myCampus} · 同校优先`
        : '最新发布';

  const kwTag = $('#keywordTag');
  if (state.keyword) {
    kwTag.textContent = '关键词：' + state.keyword + '  ✕';
    kwTag.classList.remove('hidden');
    kwTag.style.cursor = 'pointer';
    kwTag.onclick = () => { state.keyword = ''; state.page = 1; loadProducts(); pushUrl(); };
  } else {
    kwTag.classList.add('hidden');
  }

  try {
    const data = await api.products({ ...state, size: PAGE_SIZE, status: 'active' });
    $('#listCount').textContent = data.total ? `共 ${data.total} 件商品` : '';
    const ok = renderProducts(grid, data.items);
    if (!ok) {
      // 空状态给出引导
      grid.innerHTML = `
        <div class="empty" style="grid-column:1/-1">
          <div class="emoji">🔍</div>
          <div class="title">没有找到相关商品</div>
          <div>试试更换关键词、分类或放宽价格区间</div>
          <a class="btn btn-primary" href="index.html">看看全部商品</a>
        </div>`;
    }
    renderPager($('#pager'), data, (p) => {
      state.page = p;
      loadProducts();
      pushUrl();
      window.scrollTo({ top: Math.max(0, $('#productGrid').offsetTop - 120), behavior: 'smooth' });
    });
  } catch (err) {
    showError(grid, err, '<button class="btn btn-default" onclick="location.reload()">重新加载</button>');
  }
}

/* ---------- 首页统计 ---------- */
async function loadStats() {
  try {
    const s = await api.publicStats();
    const set = (k, v) => {
      const el = document.querySelector(`[data-stat="${k}"]`);
      if (el) el.textContent = numberFmt(v);
    };
    set('products', s.products_on_sale);
    set('users', s.users);
    set('completed', s.completed_orders);
  } catch {
    $('#heroStats')?.classList.add('hidden');
  }
}

/* ---------- 校区优先开关 ---------- */
function renderCampusFirst() {
  const cb = $('#campusFirst');
  if (!cb) return;
  const usable = !!myCampus;
  cb.disabled = !usable;
  cb.checked = usable && state.campus_first;
  $('#campusFirstWrap').classList.toggle('disabled', !usable);
  $('#campusHint').textContent = usable
    ? `当前校区：${myCampus}，同校商品排在前面`
    : auth.user
      ? '还没填校区，去「个人中心 → 资料」补上即可'
      : '登录并填写校区后可用';
  $('#campusTag').classList.toggle('hidden', !(usable && state.campus_first));
}

/* ---------- 交互绑定 ---------- */
function bind() {
  $('#campusFirst').addEventListener('change', (e) => {
    state.campus_first = e.target.checked && !!myCampus;
    writeSaved(state.campus_first ? '1' : '0');
    state.page = 1;
    renderCampusFirst();
    loadProducts();
    pushUrl();
  });

  $('#minPrice').value = state.min_price;
  $('#maxPrice').value = state.max_price;

  $('#applyPrice').addEventListener('click', () => {
    const mn = $('#minPrice').value.trim();
    const mx = $('#maxPrice').value.trim();
    if (mn && mx && Number(mn) > Number(mx)) { toastErr('最低价不能大于最高价'); return; }
    state.min_price = mn;
    state.max_price = mx;
    state.page = 1;
    loadProducts();
    pushUrl();
  });

  [$('#minPrice'), $('#maxPrice')].forEach((el) =>
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#applyPrice').click(); }));

  $('#quickMine').addEventListener('click', () => {
    if (requireLogin()) location.href = 'me.html#products';
  });
  $('#quickFav').addEventListener('click', () => {
    if (requireLogin()) location.href = 'me.html#favorites';
  });
  $('#quickReset').addEventListener('click', () => {
    location.href = 'index.html';
  });
  $('#heroBrowse').addEventListener('click', () => {
    $('#productGrid').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  window.addEventListener('popstate', () => location.reload());
}

/* ---------- 启动 ---------- */
bind();
renderSort();
renderConditionFilter();
renderCampusFirst();
loadCategories();
loadProducts();
loadStats();

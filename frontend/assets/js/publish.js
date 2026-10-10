/* ==========================================================================
   publish.js —— 发布 / 编辑商品
   ========================================================================== */
import api, { auth } from './api.js';
import { $, $$, escapeHtml, initPage, toast, toastOk, toastErr, getQuery, requireLogin } from './common.js';
import { moveItem, dropIndex } from './order.js';

initPage('');

if (!requireLogin('请先登录后再发布闲置')) {
  throw new Error('未登录');
}

const editId = Number(getQuery('id')) || 0;
const MAX_IMAGES = 9;

/** 已上传图片的 URL 列表（顺序即展示顺序，第一张为封面） */
let images = [];
let conditionLevel = 2;

/* ---------------------------- 分类 ---------------------------- */
async function loadCategories(selected) {
  const sel = $('#category');
  try {
    const { items } = await api.categories();
    sel.innerHTML =
      '<option value="">请选择分类</option>' +
      items.map((c) => `<option value="${c.id}" ${String(selected) === String(c.id) ? 'selected' : ''}>
        ${escapeHtml(c.icon || '')} ${escapeHtml(c.name)}</option>`).join('');
  } catch (err) {
    toastErr('分类加载失败：' + err.message);
  }
}

/* ---------------------------- 图片上传 ---------------------------- */
let dragFrom = null;
const TOUCH_ONLY = window.matchMedia('(hover: none)').matches; // 触屏无 HTML5 拖拽，改用箭头微调

function clearDropMarks() {
  $$('#uploader .upload-item').forEach((n) => n.classList.remove('drop-before', 'drop-after'));
}

/** 把第 from 张挪到 to 位置（数组下标语义），成功返回 true。
 *  真正的下标运算在 order.js 的纯函数里，便于单元测试（smoke_test.py 第 15 节）。 */
function moveImage(from, to) {
  if (!moveItem(images, from, to)) return false;
  renderUploader();
  return true;
}

function renderUploader() {
  const box = $('#uploader');
  box.querySelectorAll('.upload-item').forEach((n) => n.remove());
  // 把上传框放到最后
  const uploadBox = $('#uploadBox');
  images.forEach((url, i) => {
    const div = document.createElement('div');
    div.className = 'upload-item';
    div.draggable = true;
    div.dataset.idx = String(i);
    const nudge = TOUCH_ONLY
      ? `${i > 0 ? `<button type="button" class="mv" data-left="${i}" title="前移">‹</button>` : ''}
         ${i < images.length - 1 ? `<button type="button" class="mv" data-right="${i}" title="后移">›</button>` : ''}`
      : '';
    div.innerHTML = `
      <img src="${escapeHtml(url)}" alt="商品图 ${i + 1}" draggable="false">
      ${i === 0 ? '<div class="cover-flag">封面</div>' : `<button type="button" class="del" data-cover="${i}" title="设为封面" style="left:4px;right:auto">★</button>`}
      <button type="button" class="del" data-del="${i}" title="删除">✕</button>
      ${nudge}`;
    box.insertBefore(div, uploadBox);

    /* 拖拽排序：按住缩略图拖到另一张的左/右半边即可插入 */
    div.addEventListener('dragstart', (e) => {
      dragFrom = i;
      div.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', String(i)); } catch { /* 忽略 */ }
    });
    div.addEventListener('dragend', () => {
      dragFrom = null;
      div.classList.remove('dragging');
      clearDropMarks();
    });
    div.addEventListener('dragover', (e) => {
      if (dragFrom === null) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'move';
      const r = div.getBoundingClientRect();
      const after = e.clientX > r.left + r.width / 2;
      clearDropMarks();
      div.classList.add(after ? 'drop-after' : 'drop-before');
    });
    div.addEventListener('drop', (e) => {
      if (dragFrom === null) return;
      e.preventDefault();
      e.stopPropagation();
      const r = div.getBoundingClientRect();
      const after = e.clientX > r.left + r.width / 2;
      const from = dragFrom;
      dragFrom = null;
      clearDropMarks();
      const to = dropIndex(from, i, after);
      if (moveImage(from, to)) toast(to === 0 ? '顺序已更新，第一张为封面' : '顺序已更新');
      else div.classList.remove('dragging');
    });
  });
  uploadBox.classList.toggle('hidden', images.length >= MAX_IMAGES);

  $$('[data-del]', box).forEach((b) =>
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      images.splice(Number(b.dataset.del), 1);
      renderUploader();
    }));
  $$('[data-cover]', box).forEach((b) =>
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      const i = Number(b.dataset.cover);
      const [item] = images.splice(i, 1);
      images.unshift(item);
      renderUploader();
      toast('已设为封面');
    }));
  $$('[data-left]', box).forEach((b) =>
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      const i = Number(b.dataset.left);
      if (moveImage(i, i - 1)) toast('已前移');
    }));
  $$('[data-right]', box).forEach((b) =>
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      const i = Number(b.dataset.right);
      if (moveImage(i, i + 1)) toast('已后移');
    }));
}

async function handleFiles(files) {
  const list = Array.from(files).slice(0, MAX_IMAGES - images.length);
  if (!list.length) return;
  for (const file of list) {
    if (file.size > 5 * 1024 * 1024) { toastErr(`「${file.name}」超过 5 MB，已跳过`); continue; }
    if (!file.type.startsWith('image/')) { toastErr(`「${file.name}」不是图片，已跳过`); continue; }
    const uploadBox = $('#uploadBox');
    uploadBox.style.pointerEvents = 'none';
    uploadBox.innerHTML = '<div class="spinner"></div>';
    try {
      const res = await api.upload(file);
      images.push(res.url);
      renderUploader();
    } catch (err) {
      toastErr('上传失败：' + err.message);
    } finally {
      uploadBox.style.pointerEvents = '';
      uploadBox.innerHTML = '<span class="plus">＋</span><span>上传图片</span>';
    }
  }
  $('#fileInput').value = '';
}

function bindUploader() {
  $('#uploadBox').addEventListener('click', () => $('#fileInput').click());
  $('#fileInput').addEventListener('change', (e) => handleFiles(e.target.files));

  const box = $('#uploader');
  // 只对「从文件管理器拖入图片」点亮上传区；内部排序拖拽不能触发它
  const isFileDrag = (e) => Array.from(e.dataTransfer?.types || []).includes('Files');
  ['dragenter', 'dragover'].forEach((ev) =>
    box.addEventListener(ev, (e) => {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      box.style.outline = '2px dashed var(--primary)';
    }));
  ['dragleave', 'drop'].forEach((ev) =>
    box.addEventListener(ev, (e) => {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      box.style.outline = '';
    }));
  box.addEventListener('drop', (e) => {
    if (e.dataTransfer?.files?.length) handleFiles(e.dataTransfer.files);
  });
}

/* ---------------------------- 成色 ---------------------------- */
function bindCondition() {
  $$('#conditionGroup .seg').forEach((b) =>
    b.addEventListener('click', () => {
      conditionLevel = Number(b.dataset.v);
      $$('#conditionGroup .seg').forEach((x) => x.classList.toggle('active', x === b));
    }));
}

/* ---------------------------- 编辑模式：回填 ---------------------------- */
async function loadForEdit() {
  $('#pageTitle').textContent = '编辑商品';
  $('#submitBtn').textContent = '保存修改';
  try {
    const p = await api.product(editId);
    if (Number(p.seller_id) !== Number(auth.user.id) && auth.user.role !== 'admin') {
      toastErr('只能编辑自己发布的商品');
      setTimeout(() => (location.href = 'me.html#products'), 900);
      return;
    }
    if (p.status === 'sold') {
      toastErr('已售出的商品不能编辑');
      setTimeout(() => (location.href = 'product.html?id=' + editId), 900);
      return;
    }
    $('#title').value = p.title || '';
    $('#price').value = p.price ?? '';
    $('#originalPrice').value = p.original_price ?? '';
    $('#tradePlace').value = p.trade_place || '';
    $('#description').value = p.description || '';
    conditionLevel = Number(p.condition_level) || 2;
    $$('#conditionGroup .seg').forEach((x) => x.classList.toggle('active', Number(x.dataset.v) === conditionLevel));
    images = (p.images || []).slice(0, MAX_IMAGES);
    renderUploader();
    await loadCategories(p.category_id);
    updateCounters();
  } catch (err) {
    toastErr(err.message);
    setTimeout(() => (location.href = 'me.html#products'), 900);
  }
}

/* ---------------------------- 计数 ---------------------------- */
function updateCounters() {
  $('#titleCount').textContent = $('#title').value.length;
  $('#descCount').textContent = $('#description').value.length;
}

/* ---------------------------- 提交 ---------------------------- */
function setError(msg) {
  $('#formError').textContent = msg || '';
  if (msg) window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function submit(e) {
  e.preventDefault();
  setError('');

  const title = $('#title').value.trim();
  const categoryId = $('#category').value;
  const priceRaw = $('#price').value.trim();
  const originalRaw = $('#originalPrice').value.trim();

  if (images.length === 0) return setError('请至少上传一张商品图片');
  if (title.length < 2) return setError('标题至少 2 个字');
  if (!categoryId) return setError('请选择商品分类');
  if (priceRaw === '' || Number(priceRaw) < 0 || isNaN(Number(priceRaw))) return setError('请输入有效的出售价格');
  if (originalRaw !== '' && Number(originalRaw) < Number(priceRaw)) return setError('原价不应低于出售价格');

  const payload = {
    title,
    description: $('#description').value.trim() || null,
    price: Number(priceRaw),
    original_price: originalRaw === '' ? null : Number(originalRaw),
    category_id: Number(categoryId),
    condition_level: conditionLevel,
    trade_place: $('#tradePlace').value.trim() || null,
    images,
  };

  const btn = $('#submitBtn');
  btn.disabled = true;
  btn.textContent = editId ? '保存中…' : '发布中…';
  try {
    if (editId) {
      await api.updateProduct(editId, payload);
      toastOk('已保存修改');
      setTimeout(() => (location.href = 'product.html?id=' + editId), 700);
    } else {
      const res = await api.createProduct(payload);
      toastOk('发布成功！');
      setTimeout(() => (location.href = 'product.html?id=' + res.id), 700);
    }
  } catch (err) {
    setError(err.message);
    btn.disabled = false;
    btn.textContent = editId ? '保存修改' : '发布商品';
  }
}

/* ---------------------------- 启动 ---------------------------- */
bindUploader();
bindCondition();
$('#title').addEventListener('input', updateCounters);
$('#description').addEventListener('input', updateCounters);
$('#publishForm').addEventListener('submit', submit);
$('#resetBtn').addEventListener('click', (e) => {
  e.preventDefault();
  if (editId) { loadForEdit(); } else {
    $('#publishForm').reset();
    images = [];
    conditionLevel = 2;
    $$('#conditionGroup .seg').forEach((x) => x.classList.toggle('active', Number(x.dataset.v) === 2));
    renderUploader();
    updateCounters();
    setError('');
  }
});

if (editId) loadForEdit();
else loadCategories();
renderUploader();
updateCounters();

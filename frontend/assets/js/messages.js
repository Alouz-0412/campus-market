/* ==========================================================================
   messages.js —— 站内消息（会话列表 + 聊天窗口）
   ========================================================================== */
import api, { auth } from './api.js';
import {
  $, $$, escapeHtml, initPage, toast, toastOk, toastErr, avatarHtml, chatTime,
  fmtPrice, showEmpty, requireLogin, getQuery, refreshUnread,
} from './common.js';

initPage('messages');

if (!requireLogin('请先登录后查看消息')) {
  throw new Error('未登录');
}

const state = {
  peerId: Number(getQuery('peer_id')) || 0,
  productId: Number(getQuery('product_id')) || 0,
  conversations: [],
  peer: null,
  sending: false,
};

let convTimer = null;
let threadTimer = null;

/* ======================================================================
   会话列表
   ====================================================================== */
async function loadConversations(silent = false) {
  const box = $('#convList');
  if (!silent) box.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  try {
    const { items } = await api.conversations();
    state.conversations = items;

    if (!items.length) {
      showEmpty(box, { emoji: '📭', title: '还没有聊天记录', desc: '去商品页找卖家聊聊吧' });
      return;
    }
    box.innerHTML = items.map(convItemHtml).join('');
    $$('.conv-item', box).forEach((el) =>
      el.addEventListener('click', () => openThread(Number(el.dataset.peer), undefined, true)));
    // 若通过 URL 参数进来了一个还不存在于列表的会话，也补一个占位
    if (state.peerId && !items.some((c) => Number(c.peer_id) === state.peerId)) {
      ensurePeerCard();
    }
  } catch (err) {
    if (!silent) showEmpty(box, { emoji: '😵', title: err.message || '加载失败' });
  }
}

function convItemHtml(c) {
  const active = Number(c.peer_id) === state.peerId;
  const unread = Number(c.unread) > 0;
  return `
  <div class="conv-item ${active ? 'active' : ''}" data-peer="${c.peer_id}">
    ${avatarHtml({ nickname: c.peer_nickname, avatar: c.peer_avatar })}
    <div class="body">
      <div class="top">
        <span class="name ellipsis">${escapeHtml(c.peer_nickname || '同学')}</span>
        <span class="time">${chatTime(c.last_at)}</span>
      </div>
      <div class="row-between" style="gap:8px">
        <span class="last ellipsis">${escapeHtml(c.last_content || '')}</span>
        ${unread ? `<span class="unread-pill">${c.unread > 99 ? '99+' : c.unread}</span>` : ''}
      </div>
    </div>
  </div>`;
}

/** 当 URL 指定了一个尚无历史消息的会话时，先拉对方资料填进列表 */
async function ensurePeerCard() {
  try {
    const p = await api.userProfile(state.peerId);
    const box = $('#convList');
    const div = document.createElement('div');
    div.className = 'conv-item active';
    div.dataset.peer = p.id;
    div.innerHTML = `
      ${avatarHtml({ nickname: p.nickname, avatar: p.avatar })}
      <div class="body">
        <div class="top"><span class="name ellipsis">${escapeHtml(p.nickname)}</span></div>
        <div class="last">开始新的对话…</div>
      </div>`;
    if (box.querySelector('.empty')) box.innerHTML = '';
    box.insertBefore(div, box.firstChild);
    div.addEventListener('click', () => openThread(p.id, undefined, true));
  } catch (err) {
    toastErr('对方不存在或已被禁用');
  }
}

/* ======================================================================
   聊天窗口
   ====================================================================== */
async function openThread(peerId, productId, pushUrl = false) {
  state.peerId = peerId;
  if (productId !== undefined && productId !== null && productId !== 0) state.productId = productId;
  if (pushUrl) history.replaceState(null, '', `messages.html?peer_id=${peerId}`);

  $$('.conv-item').forEach((el) => el.classList.toggle('active', Number(el.dataset.peer) === peerId));
  const main = $('#chatMain');
  main.innerHTML = '<div class="loading" style="margin:auto"><div class="spinner"></div>加载中…</div>';

  try {
    const data = await api.thread({ peer_id: peerId, product_id: state.productId || undefined, size: 100 });
    state.peer = data.peer;
    const product = data.product;
    if (!product && data.items.length) {
      const withProduct = [...data.items].reverse().find((m) => m.product_id);
      if (withProduct) state.productId = withProduct.product_id;
    }

    main.innerHTML = `
      <div class="chat-head">
        ${avatarHtml(data.peer)}
        <div style="flex:1;min-width:0">
          <a href="user.html?id=${data.peer.id}" class="fw-600">${escapeHtml(data.peer.nickname || '同学')}</a>
          <div class="text-muted" style="font-size:12px">${escapeHtml(data.peer.campus || '')}</div>
        </div>
        <a class="btn btn-default btn-sm" href="user.html?id=${data.peer.id}">TA 的主页</a>
      </div>
      <div class="chat-body" id="chatBody">
        ${product ? productBarHtml(product) : ''}
        <div id="msgList"></div>
      </div>
      <div class="chat-foot">
        <textarea class="textarea" id="msgInput" placeholder="输入消息，Enter 发送，Shift+Enter 换行" maxlength="1000"></textarea>
        <button class="btn btn-primary" id="sendBtn" style="height:44px">发送</button>
      </div>`;

    renderMessages(data.items);
    bindComposer();
    await refreshUnread();
    loadConversations(true);

    clearInterval(threadTimer);
    threadTimer = setInterval(pollThread, 8000);
  } catch (err) {
    state.peerId = 0;
    main.innerHTML = `<div class="empty" style="margin:auto">
        <div class="emoji">😵</div><div class="title">${escapeHtml(err.message)}</div></div>`;
  }
}

function productBarHtml(p) {
  return `
  <a class="msg-product" href="product.html?id=${p.id}">
    ${p.cover ? `<img src="${escapeHtml(p.cover)}" alt="">` : ''}
    <div style="flex:1;min-width:0">
      <div class="ellipsis fw-600">${escapeHtml(p.title)}</div>
      <div style="color:#ef4444;font-weight:700">¥${fmtPrice(p.price)}</div>
    </div>
    <span class="tag">查看商品 →</span>
  </a>`;
}

function renderMessages(items) {
  const list = $('#msgList');
  if (!list) return;
  if (!items || !items.length) {
    list.innerHTML = `<div class="msg-sys"><span>还没有消息，打个招呼吧 👋</span></div>`;
    return;
  }
  let lastTime = '';
  list.innerHTML = items.map((m) => {
    const t = chatTime(m.created_at);
    let head = '';
    if (t && t !== lastTime) { head = `<div class="msg-time">${t}</div>`; lastTime = t; }
    const mine = Number(m.from_user_id) === Number(auth.user?.id);
    // 系统消息：来自订单流程，内容里带「订单」关键词且是发给自己的
    return `${head}
      <div class="msg-row ${mine ? 'mine' : ''}">
        ${avatarHtml(mine ? auth.user : { nickname: state.peer?.nickname, avatar: state.peer?.avatar }, 'avatar-sm')}
        <div class="msg-bubble">${escapeHtml(m.content)}</div>
      </div>`;
  }).join('');
  scrollBottom();
}

function scrollBottom() {
  const body = $('#chatBody');
  if (body) body.scrollTop = body.scrollHeight;
}

async function pollThread() {
  if (!state.peerId || document.hidden || state.sending) return;
  try {
    const data = await api.thread({ peer_id: state.peerId, product_id: state.productId || undefined, size: 100 });
    const list = $('#msgList');
    if (!list) return;
    const prevCount = list.querySelectorAll('.msg-row').length;
    if (data.items.length !== prevCount) {
      renderMessages(data.items);
      await refreshUnread();
      loadConversations(true);
    }
  } catch { /* 静默 */ }
}

/* ======================================================================
   发送
   ====================================================================== */
function bindComposer() {
  const input = $('#msgInput');
  const btn = $('#sendBtn');
  const send = async () => {
    const content = input.value.trim();
    if (!content) return;
    if (state.sending) return;
    state.sending = true;
    btn.disabled = true;
    try {
      await api.sendMessage({
        to_user_id: state.peerId,
        product_id: state.productId || null,
        content,
      });
      input.value = '';
      state.sending = false;
      const data = await api.thread({ peer_id: state.peerId, product_id: state.productId || undefined, size: 100 });
      renderMessages(data.items);
      loadConversations(true);
    } catch (err) {
      state.sending = false;
      toastErr(err.message);
    } finally {
      btn.disabled = false;
      input.focus();
    }
  };
  btn.addEventListener('click', send);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  });
  setTimeout(() => input.focus(), 80);
}

/* ======================================================================
   启动
   ====================================================================== */
$('#refreshBtn').addEventListener('click', async () => {
  await loadConversations();
  if (state.peerId) openThread(state.peerId);
  toastOk('已刷新');
});

await loadConversations();
if (state.peerId && state.peerId !== Number(auth.user?.id)) {
  openThread(state.peerId, state.productId || undefined);
} else if (state.peerId === Number(auth.user?.id)) {
  toastErr('不能和自己聊天');
  state.peerId = 0;
}

convTimer = setInterval(() => {
  if (!document.hidden) loadConversations(true);
}, 15000);

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) { loadConversations(true); if (state.peerId) pollThread(); }
});

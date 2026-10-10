/* ==========================================================================
   auth.js —— 登录 / 注册
   ========================================================================== */
import api, { auth } from './api.js';
import { $, initPage, toastOk, toastErr, getQuery } from './common.js';

initPage('');

/* 已登录用户直接回跳 */
if (auth.isLogin) {
  const redirect = getQuery('redirect');
  if (redirect && !redirect.startsWith('/login') && !redirect.startsWith('/register')) {
    location.replace(redirect);
  }
}

const redirectTo = () => {
  const r = getQuery('redirect');
  location.href = r && !r.includes('login.html') && !r.includes('register.html') ? r : 'index.html';
};

const setError = (msg) => {
  const box = document.getElementById('formError');
  if (box) box.textContent = msg || '';
};

function setLoading(btn, loading, text = '处理中…') {
  if (!btn) return;
  if (loading) {
    btn.dataset.text = btn.textContent;
    btn.textContent = text;
    btn.disabled = true;
  } else {
    btn.textContent = btn.dataset.text || btn.textContent;
    btn.disabled = false;
  }
}

/* ========================== 登录 ========================== */
const loginForm = document.getElementById('loginForm');
if (loginForm) {
  // 演示账号点击填入
  document.querySelectorAll('[data-fill]').forEach((el) => {
    el.addEventListener('click', () => {
      const [u, p] = el.dataset.fill.split('|');
      $('#account').value = u;
      $('#password').value = p;
      setError('');
    });
  });

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    setError('');
    const username = $('#account').value.trim();
    const password = $('#password').value;
    if (!username) return setError('请输入用户名或邮箱');
    if (!password) return setError('请输入密码');

    const btn = $('#submitBtn');
    setLoading(btn, true, '登录中…');
    try {
      const res = await api.login({ username, password });
      auth.token = res.token;
      auth.user = res.user;
      toastOk('登录成功，欢迎回来！');
      setTimeout(redirectTo, 450);
    } catch (err) {
      setError(err.message);
      setLoading(btn, false);
    }
  });
}

/* ========================== 注册 ========================== */
const registerForm = document.getElementById('registerForm');
if (registerForm) {
  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    setError('');

    const username = $('#username').value.trim();
    const nickname = $('#nickname').value.trim();
    const email = $('#email').value.trim();
    const password = $('#password').value;
    const password2 = $('#password2').value;

    if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) return setError('用户名需为 3-20 位字母、数字或下划线');
    if (nickname.length < 2 || nickname.length > 20) return setError('昵称长度需在 2-20 个字符之间');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setError('请输入有效的邮箱地址');
    if (password.length < 6) return setError('密码至少 6 位');
    if (password !== password2) return setError('两次输入的密码不一致');

    const btn = $('#submitBtn');
    setLoading(btn, true, '注册中…');
    try {
      const res = await api.register({
        username,
        nickname,
        email,
        password,
        phone: $('#phone').value.trim() || null,
        campus: $('#campus').value.trim() || null,
      });
      auth.token = res.token;
      auth.user = res.user;
      toastOk('注册成功，欢迎加入校园集市！');
      setTimeout(() => (location.href = 'index.html'), 600);
    } catch (err) {
      setError(err.message);
      setLoading(btn, false);
    }
  });
}

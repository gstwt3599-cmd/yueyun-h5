/* ============================================================
 * 粤韵新声 · 通用工具与公共组件
 * 依赖：无（原生 JS，兼容 file:// 直接打开）
 * ============================================================ */

/** 选择器 */
function $(sel, root) { return (root || document).querySelector(sel); }
function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

/** 创建元素 */
function el(tag, attrs, html) {
  const node = document.createElement(tag);
  if (attrs) {
    Object.keys(attrs).forEach(function (k) {
      if (k === 'class') node.className = attrs[k];
      else if (k === 'style') node.setAttribute('style', attrs[k]);
      else if (k.indexOf('data-') === 0) node.setAttribute(k, attrs[k]);
      else node[k] = attrs[k];
    });
  }
  if (html != null) node.innerHTML = html;
  return node;
}

/** URL 参数 */
function getParam(name) {
  const m = new RegExp('[?&]' + name + '=([^&#]*)').exec(location.search);
  return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : '';
}

/** 页面跳转（带参数） */
function go(page, params) {
  let url = page;
  if (params) {
    const parts = [];
    Object.keys(params).forEach(function (k) {
      if (params[k] !== undefined && params[k] !== null && params[k] !== '') {
        parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(params[k]));
      }
    });
    if (parts.length) url += '?' + parts.join('&');
  }
  location.href = url;
}

/** 是否从站内跳转而来（扫码直接进入时应回首页） */
function fromInsideSite() {
  try {
    const ref = document.referrer || '';
    if (!ref) return false;
    const dir = location.pathname.replace(/[^/]*$/, '');
    return ref.indexOf(location.origin + dir) === 0;
  } catch (e) { return false; }
}

/** 轻提示 */
let _toastTimer = null;
function toast(msg) {
  let box = $('.toast');
  if (!box) { box = el('div', { class: 'toast' }); document.body.appendChild(box); }
  box.textContent = msg;
  box.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(function () { box.classList.remove('show'); }, 1900);
}

/** 可复现的伪随机 */
function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** 缓动 */
function easeOutCubic(p) { return 1 - Math.pow(1 - p, 3); }
function easeInOutSine(p) { return -(Math.cos(Math.PI * p) - 1) / 2; }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function lerp(a, b, p) { return a + (b - a) * p; }

/* ---------- 本地存储：保存测试结果，便于「我的角色」回访 ---------- */
const STORE_KEY = 'yueyun.role.v1';
function saveResult(payload) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(payload)); } catch (e) { /* 隐私模式忽略 */ }
}
function loadResult() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

/* ---------- 公共组件 ---------- */
const NAV_ITEMS = [
  { page: 'index.html', icon: '曲', label: '首页' },
  { page: 'quiz.html', icon: '测', label: '测角色' },
  { page: 'role.html', icon: '相', label: '我的行当' },
  { page: 'makeup.html', icon: '妆', label: '妆造' },
  { page: 'masters.html', icon: '家', label: '名家' }
];

function currentPage() {
  const p = location.pathname.split('/').pop();
  return p && p.length ? p : 'index.html';
}

/** 顶部栏 */
function mountTopbar() {
  const host = $('[data-topbar]');
  if (!host) return;
  const title = host.getAttribute('data-title') || SITE.title;
  const sub = host.getAttribute('data-sub') || '';
  const showBack = host.getAttribute('data-back') !== 'off';
  const back = (showBack && fromInsideSite())
    ? '<a class="back" href="javascript:history.back()" aria-label="返回">‹</a>'
    : '<a class="back" href="index.html" aria-label="回到首页">⌂</a>';
  host.className = 'topbar';
  host.innerHTML =
    back +
    '<span class="tb-title">' + title + '</span>' +
    (sub ? '<span class="tb-sub">' + sub + '</span>' : '');
}

/** 底部导航 */
function mountBottomNav() {
  const host = $('[data-bottomnav]');
  if (!host) return;
  const here = currentPage();
  host.className = 'tabbar-bottom';
  host.innerHTML = NAV_ITEMS.map(function (it) {
    const on = it.page === here ? ' class="on"' : '';
    return '<a href="' + it.page + '"' + on + '><i>' + it.icon + '</i>' + it.label + '</a>';
  }).join('');
}

/** 页脚 */
function mountFooter() {
  const host = $('[data-footer]');
  if (!host) return;
  host.className = 'footer';
  host.innerHTML =
    '<div class="dot-line"></div>' +
    SITE.org + '<br>' +
    '内容整理自公开史料，仅供教学与科普使用 · 正式发布前需经专业审校<br>' +
    '© ' + new Date().getFullYear() + ' 粤韵新声项目组';
}

/** 页面初始化时统一挂载 */
function mountChrome() {
  mountTopbar();
  mountBottomNav();
  mountFooter();
}

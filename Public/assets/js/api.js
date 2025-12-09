/**
 * Path: Public/assets/js/api.js
 * 說明: 共用 API 呼叫封裝（帶上 session cookie）
 */

(function () {
  const meta = document.querySelector('meta[name="api-base"]');
  window.API_BASE = meta ? meta.getAttribute('content') || '/api' : '/api';
})();

/**
 * 呼叫 API
 * @param {string} path 例如 '/auth/login'
 * @param {string} method 'GET' | 'POST' ...
 * @param {Object|null} data
 */
async function apiRequest(path, method = 'GET', data = null) {
  const url = window.API_BASE.replace(/\/$/, '') + '/' + path.replace(/^\//, '');

  const options = {
    method,
    headers: {
      'Accept': 'application/json',
    },
    credentials: 'include',
  };

  if (data !== null) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(data);
  }

  const res = await fetch(url, options);
  let json = null;
  try {
    json = await res.json();
  } catch (e) {
    throw new Error('伺服器回傳格式錯誤');
  }

  if (!res.ok || !json || json.success === false) {
    const msg = json && json.error && json.error.message
      ? json.error.message
      : '發生未知錯誤';
    throw new Error(msg);
  }

  return json.data;
}

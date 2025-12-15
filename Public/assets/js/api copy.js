/**
 * Path: Public/assets/js/api.js
 * 說明: 共用 API 呼叫封裝（帶上 session cookie）
 *       - 讀取 <meta name="api-base"> 作為 API_BASE（預設 /api）
 *       - 提供 apiRequest()：統一處理 JSON、HTTP status、後端 success/error 格式
 */

(function () {
  var meta = document.querySelector('meta[name="api-base"]');
  window.API_BASE = meta ? (meta.getAttribute('content') || '/api') : '/api';
})();

/**
 * 呼叫 API
 * @param {string} path 例如 '/auth/login'
 * @param {string} method 'GET' | 'POST' ...
 * @param {Object|null} data
 * @returns {Promise<any>} json.data
 */
async function apiRequest(path, method, data) {
  if (!method) method = 'GET';
  if (typeof data === 'undefined') data = null;

  var base = (window.API_BASE || '/api').replace(/\/$/, '');
  var p = String(path || '').replace(/^\//, '');
  var url = base + '/' + p;

  var headers = {
    'Accept': 'application/json'
  };

  var options = {
    method: method,
    headers: headers,
    credentials: 'include'
  };

  if (data !== null) {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(data);
  }

  var res = await fetch(url, options);

  var json = null;
  try {
    json = await res.json();
  } catch (e) {
    throw new Error('伺服器回傳格式錯誤');
  }

  // 你的後端格式：json_success(data) / json_error(message,...)
  // 這裡以 {success:false, error:{message}} 為優先
  if (!res.ok || !json || json.success === false) {
    var msg =
      (json && json.error && json.error.message) ? json.error.message :
      (json && json.error && typeof json.error === 'string') ? json.error :
      '發生未知錯誤';
    throw new Error(msg);
  }

  return json.data;
}

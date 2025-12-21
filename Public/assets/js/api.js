/**
 * Path: Public/assets/js/api.js
 * 說明: 共用 API 呼叫封裝（帶上 session cookie）
 *       - 讀取 <meta name="api-base"> 作為 API_BASE（預設 /api）
 *       - apiRequest() 直接回傳「後端原始 JSON」
 *       - ❌ 不再偷偷 return json.data（這就是你現在壞掉的原因）
 */

(function () {
  var meta = document.querySelector('meta[name="api-base"]');
  window.API_BASE = meta ? (meta.getAttribute('content') || '/api') : '/api';
})();

/**
 * 呼叫 API
 * @param {string} path 例如 'managed_towns/list'
 * @param {string} method 'GET' | 'POST'
 * @param {Object|null} data
 * @returns {Promise<Object>} 後端原始 JSON（{success, data, error?}）
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

  var json;
  try {
    json = await res.json();
  } catch (e) {
    var text = '';
    try { text = await res.text(); } catch (_) {}
    text = String(text || '').slice(0, 200);
    throw new Error('伺服器回傳非 JSON 格式（HTTP ' + res.status + '）: ' + text);
  }

  // HTTP 錯誤 或 後端明確 success=false
  if (!res.ok || !json || json.success === false) {
    var msg =
      (json && json.error && json.error.message) ? json.error.message :
      (json && json.error && typeof json.error === 'string') ? json.error :
      ('HTTP ' + res.status);
    throw new Error(msg);
  }

  // ✅ 關鍵：直接回傳整包 JSON
  return json;
}

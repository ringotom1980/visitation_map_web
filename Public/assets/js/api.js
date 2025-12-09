// Public/assets/js/api.js

async function apiRequest(url, method = 'GET', data = null) {
  const options = {
    method,
    headers: {
      'Accept': 'application/json',
    },
    credentials: 'include', // 帶上 PHP Session cookie
  };

  if (data !== null) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(data);
  }

  const res = await fetch(url, options);
  const json = await res.json().catch(() => null);

  if (!res.ok || !json || json.success === false) {
    const msg = json && json.error && json.error.message
      ? json.error.message
      : '發生未知錯誤';
    throw new Error(msg);
  }

  return json.data;
}

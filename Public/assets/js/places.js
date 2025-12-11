// Public/assets/js/places.js

// Places API 封裝：專門跟後端 /api/places/* 溝通
const PlacesApi = (function () {
  const baseUrl = '/api/places';

  async function list() {
    const res = await fetch(`${baseUrl}/list.php`, {
      credentials: 'include',
    });
    if (!res.ok) throw new Error('載入地點列表失敗');
    return res.json();
  }

  async function get(id) {
    const url = `${baseUrl}/get.php?id=${encodeURIComponent(id)}`;
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) throw new Error('取得地點資料失敗');
    return res.json();
  }

  async function create(payload) {
    const res = await fetch(`${baseUrl}/create.php`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok || data.error) {
      throw new Error(data.error || '新增地點失敗');
    }
    return data;
  }

  async function update(id, payload) {
    const res = await fetch(`${baseUrl}/update.php`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...payload }),
    });
    const data = await res.json();
    if (!res.ok || data.error) {
      throw new Error(data.error || '更新地點失敗');
    }
    return data;
  }

  async function remove(id) {
    const res = await fetch(`${baseUrl}/delete.php`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    const data = await res.json();
    if (!res.ok || data.error) {
      throw new Error(data.error || '刪除地點失敗');
    }
    return data;
  }

  return {
    list,
    get,
    create,
    update,
    remove,
  };
})();

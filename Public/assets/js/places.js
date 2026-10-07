// Path: Public/assets/js/places.js
// 說明: Places API 封裝 — 統一使用 apiRequest()，避免未來 API Base 路徑調整時漏改

const PlacesApi = (function () {
  async function list() {
    return apiRequest('/places/list', 'GET');
  }

  async function get(id) {
    return apiRequest('/places/get?id=' + encodeURIComponent(id), 'GET');
  }

  async function create(payload) {
    return apiRequest('/places/create', 'POST', payload);
  }

  async function update(id, payload) {
    return apiRequest('/places/update', 'POST', Object.assign({ id: id }, payload));
  }

  async function remove(id) {
    return apiRequest('/places/delete', 'POST', { id: id });
  }

  return {
    list: list,
    get: get,
    create: create,
    update: update,
    remove: remove
  };
})();

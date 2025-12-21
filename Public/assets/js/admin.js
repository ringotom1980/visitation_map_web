/**
 * Path: Public/assets/js/admin.js
 * 說明: 管理後台（/admin）— 使用者管理（OTP 模式）
 * - OTP 已涵蓋「忘記密碼」流程，因此後台不提供「暫時密碼」重設
 * - 依賴 assets/js/api.js：apiRequest() 回傳後端原始 JSON（{success, data, error?}）
 */

document.addEventListener('DOMContentLoaded', () => {
  setupLogout();
  loadUsers();
});

function setupLogout() {
  const btn = document.getElementById('btnLogout');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    if (!confirm('確定要登出嗎？')) return;

    try {
      await apiRequest('/auth/logout', 'POST', {});
    } catch (e) {
      // ignore
    } finally {
      window.location.href = '/login';
    }
  });
}

/** 封裝：取 json.data（apiRequest 會在 success=false 時 throw） */
async function apiData(path, method, data) {
  const json = await apiRequest(path, method, data);
  return json ? json.data : null;
}

async function loadUsers() {
  const container = document.getElementById('usersContainer');
  if (!container) return;

  container.innerHTML = '<div class="empty-hint">載入中…</div>';

  try {
    const rows = await apiData('/admin/users/list', 'GET');

    if (!Array.isArray(rows) || rows.length === 0) {
      container.innerHTML = '<div class="empty-hint">目前沒有使用者。</div>';
      return;
    }

    const table = document.createElement('table');
    table.className = 'admin-table';

    const thead = document.createElement('thead');
    thead.innerHTML = `
      <tr>
        <th>姓名</th>
        <th>Email</th>
        <th>電話</th>
        <th>單位</th>
        <th>職稱</th>
        <th>角色</th>
        <th>狀態</th>
        <th>操作</th>
      </tr>
    `;
    table.appendChild(thead);

    const tbody = document.createElement('tbody');

    rows.forEach(row => {
      const role   = row.role || 'USER';
      const status = row.status || 'ACTIVE';

      const roleHtml =
        role === 'ADMIN'
          ? '<span class="badge badge-role-admin">管理者</span>'
          : '<span class="badge badge-role-user">一般</span>';

      const statusHtml =
        status === 'ACTIVE'
          ? '<span class="badge badge-status-active">啟用</span>'
          : '<span class="badge badge-status-suspended">停權</span>';

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escapeHtml(row.name || '')}</td>
        <td>${escapeHtml(row.email || '')}</td>
        <td>${escapeHtml(row.phone || '')}</td>
        <td>${escapeHtml(row.organization_name || '')}</td>
        <td>${escapeHtml(row.title || '')}</td>
        <td>${roleHtml}</td>
        <td>${statusHtml}</td>
        <td>
          <button
            class="action-btn btn-role"
            data-id="${row.id}"
            data-role="${role}"
            type="button"
          >切換角色</button>
          <button
            class="action-btn btn-status"
            data-id="${row.id}"
            data-status="${status}"
            type="button"
          >切換啟用</button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    container.innerHTML = '';
    container.appendChild(table);

    container.querySelectorAll('.btn-role').forEach(btn => {
      btn.addEventListener('click', () => toggleRole(btn));
    });
    container.querySelectorAll('.btn-status').forEach(btn => {
      btn.addEventListener('click', () => toggleStatus(btn));
    });

  } catch (err) {
    container.innerHTML =
      '<div class="empty-hint">載入使用者失敗：' + escapeHtml(err.message || '') + '</div>';
  }
}

async function toggleRole(btn) {
  const id      = Number(btn.dataset.id);
  const current = btn.dataset.role || 'USER';
  const next    = current === 'ADMIN' ? 'USER' : 'ADMIN';

  if (!confirm(`確定將此使用者角色改為 ${next} 嗎？`)) return;

  try {
    await apiData('/admin/users/set-role', 'POST', { user_id: id, role: next });
    loadUsers();
  } catch (err) {
    alert('變更角色失敗：' + (err.message || ''));
  }
}

async function toggleStatus(btn) {
  const id      = Number(btn.dataset.id);
  const current = btn.dataset.status || 'ACTIVE';
  const next    = current === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';

  if (!confirm(`確定將此使用者狀態改為 ${next} 嗎？`)) return;

  try {
    await apiData('/admin/users/set-status', 'POST', { user_id: id, status: next });
    loadUsers();
  } catch (err) {
    alert('變更狀態失敗：' + (err.message || ''));
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

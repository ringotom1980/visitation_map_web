/**
 * Path: Public/assets/js/admin.js
 * 說明: 管理後台：申請審核 + 使用者管理（手機優先）
 */

document.addEventListener('DOMContentLoaded', () => {
  setupTabs();
  setupLogout();

  loadPendingApplications();
  loadUsers();
});

function setupTabs() {
  const tabs   = document.querySelectorAll('.admin-tab');
  const panels = document.querySelectorAll('.admin-tab-panel');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;
      tabs.forEach(t => t.classList.remove('active'));
      panels.forEach(p => p.classList.remove('active'));

      tab.classList.add('active');
      const panel = document.getElementById('tab-' + target);
      if (panel) panel.classList.add('active');
    });
  });
}

function setupLogout() {
  const btn = document.getElementById('btnLogout');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    if (!confirm('確定要登出嗎？')) return;

    try {
      await apiRequest('/auth/logout', 'POST', {});
    } catch (e) {
      // ignore error, still redirect to login
    } finally {
      window.location.href = '/login';
    }
  });
}

// ===== 申請列表 =====

async function loadPendingApplications() {
  const container = document.getElementById('applicationsContainer');
  if (!container) return;

  container.innerHTML = '<div class="empty-hint">載入中…</div>';

  try {
    const rows = await apiRequest('/admin/applications/pending', 'GET');

    if (!rows || rows.length === 0) {
      container.innerHTML = '<div class="empty-hint">目前沒有待審核申請。</div>';
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
        <th>所屬單位</th>
        <th>職稱</th>
        <th>申請時間</th>
        <th>操作</th>
      </tr>
    `;
    table.appendChild(thead);

    const tbody = document.createElement('tbody');

    rows.forEach(row => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escapeHtml(row.name || '')}</td>
        <td>${escapeHtml(row.email || '')}</td>
        <td>${escapeHtml(row.phone || '')}</td>
        <td>${escapeHtml(row.organization_name || '')}</td>
        <td>${escapeHtml(row.title || '')}</td>
        <td>${escapeHtml(row.created_at || '')}</td>
        <td>
          <button
            class="action-btn action-btn--primary btn-approve"
            data-id="${row.id}"
          >核准</button>
          <button
            class="action-btn action-btn--danger btn-reject"
            data-id="${row.id}"
          >拒絕</button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    container.innerHTML = '';
    container.appendChild(table);

    container.querySelectorAll('.btn-approve').forEach(btn => {
      btn.addEventListener('click', () => handleApprove(btn.dataset.id));
    });
    container.querySelectorAll('.btn-reject').forEach(btn => {
      btn.addEventListener('click', () => handleReject(btn.dataset.id));
    });

  } catch (err) {
    container.innerHTML =
      '<div class="empty-hint">載入申請失敗：' + escapeHtml(err.message || '') + '</div>';
  }
}

async function handleApprove(id) {
  if (!confirm('確定要核准這筆申請並建立帳號嗎？')) return;

  try {
    const res = await apiRequest('/admin/applications/approve', 'POST', {
      application_id: Number(id)
    });
    alert(
      '已核准帳號申請。\n' +
      'Email：' + (res.email || '') + '\n\n' +
      '使用者可使用「申請時自行設定的密碼」登入系統。'
    );
    loadPendingApplications();
    loadUsers();
  } catch (err) {
    alert('核准失敗：' + (err.message || ''));
  }
}

async function handleReject(id) {
  const reason = prompt('拒絕原因（可留空）：', '');
  if (reason === null) return;

  try {
    await apiRequest('/admin/applications/reject', 'POST', {
      application_id: Number(id),
      reason: reason
    });
    loadPendingApplications();
  } catch (err) {
    alert('拒絕失敗：' + (err.message || ''));
  }
}

// ===== 使用者列表 =====

async function loadUsers() {
  const container = document.getElementById('usersContainer');
  if (!container) return;

  container.innerHTML = '<div class="empty-hint">載入中…</div>';

  try {
    const rows = await apiRequest('/admin/users/list', 'GET');

    if (!rows || rows.length === 0) {
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

      const emailEsc = escapeHtml(row.email || '');

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escapeHtml(row.name || '')}</td>
        <td>${emailEsc}</td>
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
          >切換角色</button>
          <button
            class="action-btn btn-status"
            data-id="${row.id}"
            data-status="${status}"
          >切換啟用</button>
          <button
            class="action-btn action-btn--danger btn-reset"
            data-id="${row.id}"
            data-email="${emailEsc}"
          >重設密碼</button>
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
    container.querySelectorAll('.btn-reset').forEach(btn => {
      btn.addEventListener('click', () => handleResetPassword(btn));
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
    await apiRequest('/admin/users/set-role', 'POST', {
      user_id: id,
      role: next
    });
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
    await apiRequest('/admin/users/set-status', 'POST', {
      user_id: id,
      status: next
    });
    loadUsers();
  } catch (err) {
    alert('變更狀態失敗：' + (err.message || ''));
  }
}

// ★ 後台「重設密碼」：產生暫時密碼給管理者口頭告知使用者
async function handleResetPassword(btn) {
  const id    = Number(btn.dataset.id);
  const email = btn.dataset.email || '';

  if (!confirm(`確定要重設此使用者的登入密碼嗎？\n\nEmail：${email}`)) return;

  try {
    const res = await apiRequest('/admin/users/reset-password', 'POST', {
      user_id: id
    });

    alert(
      '已重設密碼。\n\n' +
      '帳號（Email）：' + (res.email || email) + '\n' +
      '暫時密碼：' + (res.temp_password || '') + '\n\n' +
      '請將上述暫時密碼告知使用者，並提醒其登入後儘快更改為個人慣用密碼。'
    );
  } catch (err) {
    alert('重設密碼失敗：' + (err.message || ''));
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

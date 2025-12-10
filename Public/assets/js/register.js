/**
 * Path: Public/assets/js/register.js
 * 說明: 帳號申請頁前端行為（送出申請到 /api/applications/create）
 */

document.addEventListener('DOMContentLoaded', () => {
  const form        = document.getElementById('registerForm');
  const msgEl       = document.getElementById('registerMessage');
  const phoneInput  = document.getElementById('phone');

  // ★ 手機欄位自動加 "-"：0985-715776（4 碼 + "-" + 後面全部）
  if (phoneInput) {
    phoneInput.addEventListener('input', () => {
      // 只留數字
      const digits = phoneInput.value.replace(/\D/g, '');

      if (digits.length <= 4) {
        phoneInput.value = digits;
      } else {
        // 前 4 碼 + "-" + 其餘（最多再 6 碼，避免過長）
        const head = digits.slice(0, 4);
        const tail = digits.slice(4, 10);
        phoneInput.value = head + '-' + tail;
      }
    });
  }

  if (!form) return;

  // 從 <meta name="api-base" content="/api"> 讀取 API base
  const apiBaseMeta = document.querySelector('meta[name="api-base"]');
  const apiBase = apiBaseMeta ? apiBaseMeta.content : '/api';

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (msgEl) {
      msgEl.textContent = '';
      msgEl.classList.remove('error', 'success', 'info');
    }

    const name     = document.getElementById('name').value.trim();
    const phone    = document.getElementById('phone').value.trim();
    const email    = document.getElementById('email').value.trim();
    const orgId    = document.getElementById('org_id').value;
    const title    = document.getElementById('title').value.trim();
    const password = document.getElementById('password').value;
    const passwordConfirm = document.getElementById('password_confirm').value;

    // 必填欄位
    if (!name || !phone || !email || !orgId) {
      if (msgEl) {
        msgEl.textContent = '請完整填寫必填欄位（姓名、手機、Email、所屬單位）。';
        msgEl.classList.add('error');
      }
      return;
    }

    // Email 格式
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      if (msgEl) {
        msgEl.textContent = 'Email 格式看起來不正確，請再確認。';
        msgEl.classList.add('error');
      }
      return;
    }

    // 密碼檢查
    if (!password || !passwordConfirm) {
      if (msgEl) {
        msgEl.textContent = '請輸入密碼與再次確認密碼。';
        msgEl.classList.add('error');
      }
      return;
    }

    if (password.length < 8) {
      if (msgEl) {
        msgEl.textContent = '密碼長度至少需 8 碼。';
        msgEl.classList.add('error');
      }
      return;
    }

    if (password !== passwordConfirm) {
      if (msgEl) {
        msgEl.textContent = '兩次輸入的密碼不一致，請重新確認。';
        msgEl.classList.add('error');
      }
      return;
    }

    const payload = {
      name,
      phone,
      email,
      org_id: orgId,         // 後端會轉成 organization_id
      title,
      password,
      password_confirm: passwordConfirm,
    };

    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) {
      submitBtn.disabled = true;
    }
    if (msgEl) {
      msgEl.textContent = '申請送出中，請稍候…';
      msgEl.classList.add('info');
    }

    try {
      const res = await fetch(apiBase + '/applications/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'same-origin',
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || data.success === false) {
        const errMsg =
          (data && data.error && (data.error.message || data.error)) ||
          data.message ||
          '申請失敗，請稍後再試。';
        if (msgEl) {
          msgEl.textContent = errMsg;
          msgEl.classList.remove('info');
          msgEl.classList.add('error');
        }
        return;
      }

      if (msgEl) {
        msgEl.textContent = '申請已送出，待管理者審核通過後即可登入。\n3 秒後將回登入頁。';
        msgEl.classList.remove('info');
        msgEl.classList.add('success');
      }

      form.reset();

      // 3 秒後導回登入頁，帶上 applied=1
      setTimeout(() => {
        window.location.href = '/login?applied=1';
      }, 3000);

    } catch (err) {
      if (msgEl) {
        msgEl.textContent = err && err.message
          ? '發生錯誤：' + err.message
          : '申請失敗，請稍後再試。';
        msgEl.classList.remove('info');
        msgEl.classList.add('error');
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
      }
    }
  });
});

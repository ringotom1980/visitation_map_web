<?php

/**
 * Path: Public/register.php
 * 說明: 帳號申請頁（對外路徑: /register，手機優先）
 */

require_once __DIR__ . '/../config/auth.php';

// 若已登入，直接導向主地圖
if (current_user_id()) {
  header('Location: ' . route_url('app'));
  exit;
}

// 讀取「所屬單位」選項（organizations）
$orgOptions = [];

try {
  require_once __DIR__ . '/../config/db.php';
  $pdo = db();

  $sql = "SELECT id, name
            FROM organizations
            WHERE is_active = 1
            ORDER BY id ASC";
  $stmt = $pdo->query($sql);
  $orgOptions = $stmt->fetchAll() ?: [];
} catch (Throwable $e) {
  $orgOptions = [];
}

$pageTitle = APP_NAME . ' - 申請帳號';
$pageCss = [
  'assets/css/login.css',
  'assets/css/register.css',
];

?>
<!DOCTYPE html>
<html lang="zh-Hant">

<?php require __DIR__ . '/partials/head.php'; ?>

<body class="login-body">
  <div class="login-shell">

    <!-- 上方品牌（跟登入一樣沒關係） -->
    <header class="login-brand">
      <div class="brand-logo-wrap">
        <img src="<?= asset_url('assets/img/logo128.png') ?>" alt="Logo" class="brand-logo-img">
        <div class="brand-text">
          <div class="brand-name"><?= htmlspecialchars(APP_NAME, ENT_QUOTES, 'UTF-8') ?></div>
          <div class="brand-sub">遺眷親訪定位與路線規劃工具</div>
        </div>
      </div>
    </header>

    <!-- ✅ 這裡開始是「明顯不同於登入頁」的內容 -->
    <main class="login-wrapper">
      <h1 class="login-title">申請帳號</h1>

      <p class="register-note">
        請填寫以下資料，系統將寄送驗證碼至您的 Email 進行帳號驗證。
      </p>
      <!-- Email OTP 驗證（第二階段） -->
      <div id="otpSection" class="otp-section" hidden>
        <label class="form-group">
          <span class="form-label">Email 驗證碼</span>
          <input
            type="text"
            id="otp"
            inputmode="numeric"
            autocomplete="one-time-code"
            placeholder="請輸入 6 位數驗證碼"
            maxlength="6">
        </label>

        <button type="button" id="btnVerifyOtp" class="btn-primary btn-block">
          驗證並完成註冊
        </button>
      </div>

      <form id="registerForm" class="login-form" autocomplete="on">

        <!-- 姓名 -->
        <label class="form-group">
          <span class="form-label">姓名</span>
          <input
            type="text"
            name="name"
            id="name"
            required
            autocomplete="name"
            placeholder="請輸入姓名">
        </label>

        <!-- 手機 -->
        <label class="form-group">
          <span class="form-label">手機</span>
          <input
            type="tel"
            name="phone"
            id="phone"
            required
            inputmode="tel"
            autocomplete="tel"
            placeholder="例如：0912-345678 或 0912345678"
            maxlength="12">
        </label>

        <!-- Email -->
        <label class="form-group">
          <span class="form-label">Email（做為登入帳號）</span>
          <input
            type="email"
            name="email"
            id="email"
            required
            inputmode="email"
            autocomplete="email"
            placeholder="name@example.com">
        </label>

        <!-- 密碼 -->
        <label class="form-group">
          <span class="form-label">設定密碼</span>
          <input
            type="password"
            name="password"
            id="password"
            required
            autocomplete="new-password"
            minlength="8"
            placeholder="請輸入密碼（至少 8 碼）">
        </label>

        <!-- 再次輸入密碼 -->
        <label class="form-group">
          <span class="form-label">再次輸入密碼</span>
          <input
            type="password"
            name="password_confirm"
            id="password_confirm"
            required
            autocomplete="new-password"
            minlength="8"
            placeholder="請再輸入一次密碼">
        </label>

        <!-- 所屬單位 -->
        <label class="form-group">
          <span class="form-label">所屬單位</span>
          <select
            name="org_id"
            id="org_id"
            required>
            <option value="">請選擇所屬單位</option>
            <?php if (!empty($orgOptions)): ?>
              <?php foreach ($orgOptions as $org): ?>
                <option value="<?= (int)$org['id'] ?>">
                  <?= htmlspecialchars($org['name'], ENT_QUOTES, 'UTF-8') ?>
                </option>
              <?php endforeach; ?>
            <?php else: ?>
              <option value="" disabled>（尚未設定單位，請聯絡管理者）</option>
            <?php endif; ?>
          </select>
        </label>

        <!-- 職稱 -->
        <label class="form-group">
          <span class="form-label">職稱</span>
          <input
            type="text"
            name="title"
            id="title"
            autocomplete="organization-title"
            placeholder="例如：政戰幹事">
        </label>

        <!-- 送出按鈕 -->
        <button type="submit" class="btn-primary btn-block">送出申請</button>

        <!-- 回登入連結（這行文字也跟登入頁不一樣） -->
        <p class="login-extra">
          已有帳號？<a href="<?= route_url('login') ?>">回登入頁</a>
        </p>

        <!-- 顯示申請結果訊息 -->
        <p id="registerMessage" class="login-message"></p>

      </form>
    </main>

    <footer class="login-footer">
      <small>© <?= date('Y') ?> <?= htmlspecialchars(APP_NAME, ENT_QUOTES, 'UTF-8') ?></small>
    </footer>

  </div>

  <!-- 共用 JS + 此頁專屬 JS 都寫在這裡 -->
  <script src="<?= asset_url('assets/js/api.js') ?>"></script>
  <script src="<?= asset_url('assets/js/register.js') ?>"></script>
</body>

</html>
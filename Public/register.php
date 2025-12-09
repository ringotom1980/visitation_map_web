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
            ORDER BY name ASC";
    $stmt = $pdo->query($sql);
    $orgOptions = $stmt->fetchAll() ?: [];
} catch (Throwable $e) {
    $orgOptions = [];
}

$pageTitle = APP_NAME . ' - 申請帳號';
$pageCss   = ['assets/css/login.css']; // 共用登入/註冊頁樣式
?>
<!DOCTYPE html>
<html lang="zh-Hant">

<?php require __DIR__ . '/partials/head.php'; ?>

<body class="login-body">
  <div class="login-shell">

    <!-- 上方品牌：沿用登入頁風格 -->
    <header class="login-brand">
      <div class="brand-logo-wrap">
        <img src="<?= asset_url('assets/img/logo.png') ?>" alt="Logo" class="brand-logo-img">
        <div class="brand-text">
          <div class="brand-name"><?= htmlspecialchars(APP_NAME, ENT_QUOTES, 'UTF-8') ?></div>
          <div class="brand-sub">遺眷親訪定位與路線規劃工具</div>
        </div>
      </div>
    </header>

    <!-- 申請卡片 -->
    <main class="login-wrapper">
      <h1 class="login-title">申請帳號</h1>

      <p class="register-note">
        請填寫以下資料送出申請，經管理者審核通過後即可登入系統。
      </p>

      <form id="registerForm" class="login-form" autocomplete="on">

        <label class="form-group">
          <span class="form-label">姓名</span>
          <input type="text" name="name" id="name" required autocomplete="name" placeholder="請輸入姓名">
        </label>

        <label class="form-group">
          <span class="form-label">手機</span>
          <input type="tel" name="phone" id="phone" required inputmode="tel" autocomplete="tel" placeholder="例如：0912-345-678">
        </label>

        <label class="form-group">
          <span class="form-label">Email（做為登入帳號）</span>
          <input type="email" name="email" id="email" required inputmode="email" autocomplete="email" placeholder="name@example.com">
        </label>

        <label class="form-group">
          <span class="form-label">所屬單位</span>
          <select name="org_id" id="org_id" required>
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

        <label class="form-group">
          <span class="form-label">職稱</span>
          <input type="text" name="title" id="title" autocomplete="organization-title" placeholder="例如：政戰幹事">
        </label>

        <button type="submit" class="btn-primary btn-block">送出申請</button>

        <p class="login-extra">
          已有帳號？<a href="<?= route_url('login') ?>">回登入頁</a>
        </p>

        <p id="registerMessage" class="login-message"></p>

      </form>
    </main>

    <footer class="login-footer">
      <small>© <?= date('Y') ?> <?= htmlspecialchars(APP_NAME, ENT_QUOTES, 'UTF-8') ?></small>
    </footer>
  </div>

  <!-- ★★★ 方案 C：此頁專屬 JS「由頁面自己載入」 -->
  <script src="<?= asset_url('assets/js/register.js') ?>"></script>

<?php require __DIR__ . '/partials/footer.php'; ?>
</body>
</html>

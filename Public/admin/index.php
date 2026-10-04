<?php
 declare(strict_types=1);
 require_once __DIR__.'/../../config/auth.php';require_admin_page();header('Cache-Control: no-store');
 $pageTitle=APP_NAME.' - 管理後台';$pageCss=['assets/css/base.css','assets/css/admin.css'];
 ?>
 <!doctype html><html lang="zh-Hant"><?php require __DIR__.'/../partials/head.php'; ?>
 <body class="admin-body"><header class="admin-header"><div class="admin-brand"><span class="admin-app-name"><?= htmlspecialchars(APP_NAME,ENT_QUOTES,'UTF-8') ?></span><span class="admin-sub"><?= is_owner()?'系統管理員':'管理者' ?></span></div><nav class="admin-nav"><a href="<?= route_url('app') ?>" class="btn-link">回主地圖</a><a href="<?= route_url('profile') ?>" class="btn-link">個人資料</a></nav></header>
 <main class="admin-main"><div class="admin-intro"><div><p class="eyebrow">服務管理中心</p><h1>管理後台</h1><p>依工作選擇入口。管理者具全單位業務權限；管理者任免專屬系統管理員。</p></div></div>
 <?php if(!owner_user_id()): ?><p class="admin-feedback is-error">系統管理員身分尚未安全綁定，帳戶權限及單位調整暫停；一般地圖業務仍可使用。</p><?php endif; ?>
 <div class="admin-stats dashboard-cards">
 <a class="stat-card" href="<?= route_url('admin') ?>/accounts"><h2>帳戶與單位</h2><p>單位人數總覽、人員列表與跨單位搜尋</p></a>
 <a class="stat-card" href="<?= route_url('admin') ?>/transfers"><h2>單位異動待審</h2><p>審核異動申請、調整一般使用者單位</p></a>
 <a class="stat-card" href="<?= route_url('admin') ?>/security"><h2>安全與操作紀錄</h2><p>登入安全、帳戶權限操作與異動紀錄</p></a>
 <?php if(is_owner()): ?><a class="stat-card" href="<?= route_url('admin') ?>/accounts?view=authorization"><h2>管理者授權</h2><p>任命及撤除管理者，系統管理員帳戶受保護</p></a><?php endif; ?>
 </div></main></body></html>

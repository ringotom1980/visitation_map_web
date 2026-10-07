<?php
declare(strict_types=1);

/** Private, immutable identity binding. Never derive ownership from editable email. */
function owner_user_id(): int
{
    $value = (string)env('OWNER_USER_ID', '');
    return preg_match('/^[1-9][0-9]*$/D', $value) ? (int)$value : 0;
}
function user_is_owner(array $user): bool
{
    return owner_user_id() > 0 && (int)$user['id'] === owner_user_id();
}
function user_is_admin(array $user): bool
{
    return ($user['status'] ?? '') === 'ACTIVE' && (user_is_owner($user) || ($user['role'] ?? '') === 'ADMIN');
}
function is_owner(): bool
{
    $user = current_user();
    return $user && user_is_owner($user);
}
/** No account administration until the binding is configured; business APIs still work. */
function account_action_allowed(array $actor, array $target, string $action): bool
{
    if (!owner_user_id() || !user_is_admin($actor) || user_is_owner($target)) return false;
    if ((int)$actor['id'] === (int)$target['id']) return false;
    if ($action === 'role') return user_is_owner($actor);
    // Password recovery must be performed by the account holder through OTP.
    if ($action === 'password') return false;
    return user_is_owner($actor) || ($target['role'] ?? '') === 'USER';
}

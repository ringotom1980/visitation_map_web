-- Manual migration only. MySQL 5.7+/MariaDB 10.2+, InnoDB required.
-- Back up the selected database first. Do not run against a guessed database.
-- Creates two new tables; does not ALTER users/organizations/places or move records.
CREATE TABLE organization_transfer_requests (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 user_id BIGINT UNSIGNED NOT NULL,
 user_name VARCHAR(100) NOT NULL,
 from_organization_id BIGINT UNSIGNED NOT NULL,
 to_organization_id BIGINT UNSIGNED NOT NULL,
 from_organization_name VARCHAR(100) NOT NULL,
 to_organization_name VARCHAR(100) NOT NULL,
 reason VARCHAR(1000) NOT NULL,
 status ENUM('PENDING','APPROVED','REJECTED','WITHDRAWN','SUPERSEDED') NOT NULL DEFAULT 'PENDING',
 pending_user_id BIGINT UNSIGNED GENERATED ALWAYS AS (CASE WHEN status='PENDING' THEN user_id ELSE NULL END) STORED,
 reviewed_by_user_id BIGINT UNSIGNED NULL,
 review_reason VARCHAR(1000) NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 resolved_at DATETIME NULL,
 UNIQUE KEY uq_transfer_pending_user (pending_user_id),
 KEY idx_transfer_user_history (user_id,id),
 KEY idx_transfer_queue (status,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE organization_change_audit (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 user_id BIGINT UNSIGNED NOT NULL,
 user_name VARCHAR(100) NOT NULL,
 actor_user_id BIGINT UNSIGNED NOT NULL,
 actor_name VARCHAR(100) NOT NULL,
 from_organization_id BIGINT UNSIGNED NOT NULL,
 to_organization_id BIGINT UNSIGNED NOT NULL,
 from_organization_name VARCHAR(100) NOT NULL,
 to_organization_name VARCHAR(100) NOT NULL,
 reason VARCHAR(1000) NOT NULL,
 change_type ENUM('APPROVED_REQUEST','DIRECT') NOT NULL,
 request_id BIGINT UNSIGNED NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 KEY idx_change_user_history (user_id,id),
 KEY idx_change_request (request_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

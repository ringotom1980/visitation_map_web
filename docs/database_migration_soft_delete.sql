-- Soft delete support for places.
-- Run this once in phpMyAdmin on the production database before deploying
-- the soft-delete version, or when create/update/list APIs report an outdated
-- places schema.

ALTER TABLE places
  ADD COLUMN IF NOT EXISTS deleted_at datetime DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS deleted_by_user_id bigint(20) UNSIGNED DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS deleted_note varchar(255) DEFAULT NULL;

ALTER TABLE places
  DROP INDEX IF EXISTS uq_places_org_serv_benef;

CREATE INDEX IF NOT EXISTS idx_places_org_serv_benef
  ON places (organization_id, serviceman_name, visit_name);

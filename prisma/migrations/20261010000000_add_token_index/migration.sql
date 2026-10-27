-- Indexed lookup for verification / reset tokens.
--
-- WHY
-- ---
-- `verification_tokens.token` stores a bcrypt hash, which is salted and
-- non-deterministic, so it cannot be searched by its input. Both consuming
-- routes therefore had to fetch up to 50 unexpired rows and bcrypt-compare
-- the presented token against each. That bounds the worst case but means a
-- legitimate token sorting beyond the window is rejected, and the table only
-- grows because expired rows are never pruned.
--
-- WHAT
-- ---
-- `tokenIndex` is a keyed (HMAC-SHA256) digest of the raw token, derived with
-- HKDF from AUTH_SECRET. It is deterministic, so it is indexable, and keyed,
-- so a table dump alone cannot be used to confirm a guessed token offline.
-- bcrypt remains the authoritative check; the digest only locates the row.
--
-- `purpose` records which route may consume the row ('verify' | 'reset'),
-- replacing the previous inference from the token's own `v_`/`r_` prefix.
--
-- COMPATIBILITY
-- -------------
-- Both columns are NULLABLE with no default:
--   * no table rewrite, no lock beyond a brief ACCESS EXCLUSIVE
--   * existing rows keep tokenIndex = NULL and purpose = NULL
--   * NULL purpose means "legacy, unknown", accepted by both routes, which
--     preserves current behaviour for tokens already sitting in inboxes
--
-- ROLLOUT
-- -------
--   1. apply this migration
--   2. deploy code that WRITES tokenIndex + purpose on issue
--   3. deploy the dual-path resolver (indexed first, bounded sweep as fallback)
--   4. after the maximum token TTL has elapsed, drop the fallback sweep
--
-- Steps 2 and 3 ship together. Step 4 is a follow-up change, not part of this
-- migration. Existing rows are NOT backfilled — the raw token cannot be
-- recovered from its bcrypt hash, which is exactly why the fallback exists.

ALTER TABLE "verification_tokens"
  ADD COLUMN "tokenIndex" TEXT,
  ADD COLUMN "purpose" TEXT;

-- Partial unique index: many legacy rows share NULL, and SQL treats NULLs as
-- distinct in a unique constraint, so a plain UNIQUE would also work but this
-- makes the intent explicit and keeps the index small.
CREATE UNIQUE INDEX "verification_tokens_tokenIndex_key"
  ON "verification_tokens" ("tokenIndex");

COMMENT ON COLUMN "verification_tokens"."tokenIndex" IS
  'HMAC-SHA256(AUTH_SECRET-derived key, raw token). Indexed lookup key; bcrypt in "token" stays authoritative. NULL = legacy row.';
COMMENT ON COLUMN "verification_tokens"."purpose" IS
  'verify | reset. NULL = legacy row, accepted by both routes.';
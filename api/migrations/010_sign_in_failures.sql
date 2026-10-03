-- 010_sign_in_failures: the sign-in protection's counter (design-accounts.md, "Sign-in protection";
-- numbers approved by lenzi on 2026-10-03: after 5 wrong passwords in a row, each further attempt
-- waits 2 s, doubling up to 60 s, back to nothing at the first right one).
--
-- One row per user who got their password wrong: how many times in a row, and when the last time
-- was. In the database, so a restart does not wipe it, like the rate limit's counters. Keyed by the
-- user's id, never by a name. Auth mechanics, like sessions: set back to zero at the first right
-- password, deleted with the user.
--
-- Safe to re-run: created only when missing.

CREATE TABLE IF NOT EXISTS sign_in_failures (
  user_id          INT UNSIGNED  NOT NULL PRIMARY KEY,
  failures         INT UNSIGNED  NOT NULL,            -- wrong passwords in a row
  last_failure_at  DATETIME(3)   NOT NULL,
  CONSTRAINT fk_sign_in_failures_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

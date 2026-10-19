-- The default privileges from 0001 gave evidence_app full access to every new table.
-- Sessions, accounts (password hashes) and verifications are secrets only Better Auth may
-- read, so the app role loses all access to them. It keeps access to invitations, which
-- tenant-isolation policies scope to the current workspace.
REVOKE ALL ON "sessions", "accounts", "verifications" FROM evidence_app;--> statement-breakpoint

-- evidence_auth (Better Auth) gets the auth tables only. It has no grants on tenant data
-- (groups, group_members, audit_log, and future documents/chunks), and the default
-- privileges in 0001 apply to evidence_app only, so new tables stay closed to it.
GRANT SELECT, INSERT, UPDATE, DELETE
  ON "users", "sessions", "accounts", "verifications", "tenants", "memberships", "invitations"
  TO evidence_auth;

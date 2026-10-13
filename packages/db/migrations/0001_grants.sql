-- Privileges for the application role. RLS policies decide which rows evidence_app sees;
-- these grants decide which statements it may run at all. Kept in migrations (not the
-- Postgres init script) so every environment, including RDS, gets the same grants.
GRANT SELECT, INSERT, UPDATE, DELETE ON "tenants", "users", "memberships", "groups", "group_members" TO evidence_app;--> statement-breakpoint

-- audit_log is append-only for the application: no UPDATE or DELETE, even within a tenant.
GRANT SELECT, INSERT ON "audit_log" TO evidence_app;--> statement-breakpoint

-- Tables created by future migrations get the same default access. Append-only or
-- restricted tables must REVOKE explicitly, as above.
ALTER DEFAULT PRIVILEGES FOR ROLE evidence_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO evidence_app;--> statement-breakpoint
ALTER DEFAULT PRIVILEGES FOR ROLE evidence_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO evidence_app;

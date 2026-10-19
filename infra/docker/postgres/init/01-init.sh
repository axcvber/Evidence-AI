#!/bin/sh
# Runs once, on first start of an empty data volume.
# - `evidence_owner`: owns the schema and runs migrations. Not a superuser, so it cannot
#   bypass RLS by accident either.
# - `evidence_app`: the role the API and worker connect as. It owns nothing and cannot bypass
#   RLS, so tenant policies always apply to application queries. Grants come from migrations.
# - `evidence_auth`: the role only Better Auth connects as. Migrations give it policies and
#   grants on the auth tables (users, sessions, accounts, tenants, memberships, ...) only.
# - `evidence` (dev) and `evidence_test` (integration tests) databases with pgvector.
# - A separate role and database for Langfuse.
# Production (RDS) runs the equivalent bootstrap once as the master user (step 1.9).
set -eu

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v owner_password="$EVIDENCE_OWNER_DB_PASSWORD" \
  -v app_password="$EVIDENCE_APP_DB_PASSWORD" \
  -v auth_password="$EVIDENCE_AUTH_DB_PASSWORD" \
  -v langfuse_password="$LANGFUSE_DB_PASSWORD" <<'SQL'
CREATE ROLE evidence_owner LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS
  PASSWORD :'owner_password';
CREATE ROLE evidence_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS
  PASSWORD :'app_password';
CREATE ROLE evidence_auth LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS
  PASSWORD :'auth_password';

CREATE DATABASE evidence_test;

CREATE ROLE langfuse LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD :'langfuse_password';
CREATE DATABASE langfuse OWNER langfuse;
REVOKE ALL ON DATABASE langfuse FROM PUBLIC;
SQL

for db in evidence evidence_test; do
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$db" <<'SQL'
CREATE EXTENSION IF NOT EXISTS vector;

SELECT format('ALTER DATABASE %I OWNER TO evidence_owner', current_database()) \gexec
ALTER SCHEMA public OWNER TO evidence_owner;
SELECT format('REVOKE ALL ON DATABASE %I FROM PUBLIC', current_database()) \gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO evidence_app, evidence_auth', current_database()) \gexec
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO evidence_app, evidence_auth;
SQL
done

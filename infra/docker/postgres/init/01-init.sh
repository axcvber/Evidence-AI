#!/bin/sh
# Runs once, on first start of an empty data volume.
# - `vector` extension in the app database.
# - `evidence_app`: the role the API and worker connect as. It is not a superuser and
#   cannot bypass RLS, so tenant policies (step 1.3) always apply to application queries.
# - A separate role and database for Langfuse.
set -eu

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v app_password="$EVIDENCE_APP_DB_PASSWORD" \
  -v langfuse_password="$LANGFUSE_DB_PASSWORD" <<'SQL'
CREATE EXTENSION IF NOT EXISTS vector;

CREATE ROLE evidence_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS
  PASSWORD :'app_password';
REVOKE ALL ON DATABASE evidence FROM PUBLIC;
GRANT CONNECT ON DATABASE evidence TO evidence_app;
GRANT USAGE ON SCHEMA public TO evidence_app;

CREATE ROLE langfuse LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD :'langfuse_password';
CREATE DATABASE langfuse OWNER langfuse;
REVOKE ALL ON DATABASE langfuse FROM PUBLIC;
SQL

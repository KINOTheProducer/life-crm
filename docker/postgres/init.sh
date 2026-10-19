#!/bin/sh
# Create a non-superuser role for the app so row-level security applies to it.
set -e
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-SQL
  CREATE ROLE life_crm LOGIN PASSWORD '${APP_DB_PASSWORD}';
  CREATE DATABASE life_crm OWNER life_crm;
SQL

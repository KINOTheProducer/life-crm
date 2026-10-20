# Unraid

1. Install a Postgres 16 container (`pgvector/pgvector:pg16` works). In it, create a role and database:
   ```sql
   CREATE ROLE life_crm LOGIN PASSWORD 'pick-one';
   CREATE DATABASE life_crm OWNER life_crm;
   ```
2. Copy `life-crm.xml` to `/boot/config/plugins/dockerMan/templates-user/` on the Unraid box.
3. Docker tab, Add Container, pick `life-crm` from the template list.
4. Fill in `DATABASE_URL`, `BETTER_AUTH_SECRET` (`openssl rand -base64 32`) and `BETTER_AUTH_URL`, then apply.
5. Open the web UI and create your account (only the first sign-up is allowed).

The image is built by the release workflow on every push to main: `ghcr.io/kinotheproducer/life-crm:latest`. If the package is private on GitHub, make it public or log Unraid into ghcr.io.

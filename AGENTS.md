# Xray Agent Notes

## Deployment

- Production runs on the Mac mini under the `infra` account
- Deploy workflow: `.github/workflows/deploy.yml`
- Runner label: `[self-hosted, mac-mini, prod, xray]`
- Deploy trigger: `push` to `main`

## Production Compose

- File: `docker-compose.prod.yml`
- Services:
  - `xray-backend`
  - `xray-frontend`
- Network: external `shared_network`

## Secrets / Env

- Production deploys build a transient env file from committed `config/production.env` plus GitHub Actions secrets synced from Doppler
- Deploy workflow passes the transient path via `APP_ENV_FILE`
- `docker-compose.prod.yml` defaults to `.env` only when `APP_ENV_FILE` is not set
- env handling for this repo has shown drift; treat Doppler as the intended production source of truth for secrets

## Operational Notes

- Frontend uses `nginx.prod.conf`
- backend uses tmpfs volumes `clone-data` and `cache-data`
- reverse proxy is managed centrally in `mac-mini-infra`

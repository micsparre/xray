# Xray Agent Notes

## Git Start Rule

Before starting a new task in this repo:

1. check the current branch
2. inspect the staging area and working tree
3. notify the user if there are unstaged, staged, or other uncommitted changes
4. if the repo is clean and the task should begin from main, switch to local `main`, ensure it tracks `origin/main`, and sync to the latest remote state before making changes

Do not blindly switch branches or pull if there is existing uncommitted work.

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

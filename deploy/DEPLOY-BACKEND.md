# Deployment — full stack on the Azure VM (Postgres + FastAPI + nginx /api)

This brings up the **authenticated app**: FastAPI backend on Postgres behind
`/api`, plus the rebuilt frontend. It assumes the static site is already live
at `https://training.ozellar.com` over HTTPS (wildcard cert), the repo is at
`/opt/ozellar`, the web root is `/var/www/ozellar`, and the training videos
already exist at `/var/www/ozellar/media`.

VM: `Deployer@52.172.91.85` (Ubuntu). Run everything on the VM unless noted.
The API runs on local port **8021** (change everywhere if taken).

Production seed = **admin + the 3 courses only** (no demo crew, no enrollments).

---

## 1. Update the source

```bash
cd /opt/ozellar
git pull
```

## 2. Install Postgres + Python venv tooling

```bash
sudo apt update
sudo apt install -y postgresql python3-venv python3-pip
```

## 3. Create the database and app user

Pick a strong DB password and use it in Step 4.

```bash
sudo -u postgres psql -c "CREATE USER ozellar_app WITH PASSWORD 'CHANGE_ME_DB_PW';"
sudo -u postgres psql -c "CREATE DATABASE ozellar OWNER ozellar_app;"
```

## 4. Backend environment file

```bash
cd /opt/ozellar/backend
# generate a secret
python3 -c "import secrets; print(secrets.token_hex(32))"
```

Create `/opt/ozellar/backend/.env` (use the DB password from Step 3 and the
secret you just generated):

```
DATABASE_URL=postgresql+psycopg2://ozellar_app:CHANGE_ME_DB_PW@localhost:5432/ozellar
SECRET_KEY=<paste the generated secret>
CORS_ORIGINS=https://training.ozellar.com
PUBLIC_BASE_URL=https://training.ozellar.com
```

Lock it down (systemd reads it as user Deployer):

```bash
chmod 600 /opt/ozellar/backend/.env
```

## 5. Python venv + dependencies

```bash
cd /opt/ozellar/backend
python3 -m venv .venv
.venv/bin/pip install --upgrade pip
.venv/bin/pip install -r requirements.txt
```

## 6. Create the schema and seed (production data only)

```bash
cd /opt/ozellar/backend
.venv/bin/python -m alembic upgrade head
SEED_MODE=prod .venv/bin/python -m app.seed   # admin + 3 courses ONLY
```

Expect: `[prod] Seeded 3 courses and the admin only (no demo crew, no enrollments).`

## 7. Run the API under systemd (port 8021)

Confirm the port is free first:

```bash
sudo ss -ltnp | grep :8021 || echo "8021 is free"
```

Install and start the service:

```bash
sudo cp /opt/ozellar/deploy/ozellar-api.service /etc/systemd/system/ozellar-api.service
sudo systemctl daemon-reload
sudo systemctl enable --now ozellar-api
sudo systemctl status ozellar-api --no-pager
```

Smoke-test the API locally (bypassing nginx):

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8021/docs        # 200
curl -s -X POST http://127.0.0.1:8021/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"mode":"admin","email":"admin@ozellarmarine.com","password":"Admin@123"}'  # returns a token
```

## 8. Add the `/api` proxy to nginx

The repo's `deploy/nginx-ozellar.conf` now includes the `/api` → `127.0.0.1:8021`
block. Copy it over the existing site and reload:

```bash
sudo cp /opt/ozellar/deploy/nginx-ozellar.conf /etc/nginx/sites-available/ozellar
sudo nginx -t
sudo systemctl reload nginx
```

Test through HTTPS:

```bash
curl -s -X POST https://training.ozellar.com/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"mode":"admin","email":"admin@ozellarmarine.com","password":"Admin@123"}'
```

## 9. Rebuild and publish the frontend

On the VM the repo has no `public/media` (git-ignored), so the build is clean
and the existing `/var/www/ozellar/media` is untouched by the copy.

```bash
cd /opt/ozellar/frontend
npm ci
npm run build
sudo cp -r dist/* /var/www/ozellar/
sudo chown -R www-data:www-data /var/www/ozellar
```

## 10. Smoke test in a browser

Open `https://training.ozellar.com`:
1. Admin login (`admin@ozellarmarine.com` / `Admin@123`) → `/admin`.
2. Users → create a crew member.
3. Assignments → assign a course.
4. Log out, log in as that crew member (name + DOB) → the assigned course shows,
   video plays, complete a lesson, pass the assessment → certificate PDF.

**Change the admin password after go-live** — `Admin@123` is public in the repo.

---

## Redeploying after a git change

```bash
cd /opt/ozellar && git pull
# backend changed:
cd backend && .venv/bin/pip install -r requirements.txt && .venv/bin/python -m alembic upgrade head
sudo systemctl restart ozellar-api
# frontend changed:
cd ../frontend && npm ci && npm run build && sudo cp -r dist/* /var/www/ozellar/
```

`SEED_MODE=prod python -m app.seed` is safe to re-run (non-destructive: refreshes
course content, never touches real users/progress/certs).

## Troubleshooting

- **API 502 via nginx:** `sudo systemctl status ozellar-api` and
  `sudo journalctl -u ozellar-api -n 50` — usually a bad `.env` / DB password.
- **DB auth fails:** verify `DATABASE_URL` matches the Step 3 user/password and
  that `sudo -u postgres psql -c "\l"` lists `ozellar`.
- **Port 8021 taken:** pick another free port and change it in
  `ozellar-api.service` **and** `nginx-ozellar.conf`, then reload both.
- **Migrations:** `.venv/bin/python -m alembic current` shows the applied head.

# Deployment — full stack on the Azure VM (Postgres + FastAPI + nginx /api)

This brings up the **authenticated app**: FastAPI backend on Postgres behind
`/api`, plus the rebuilt frontend. It assumes the static site is already live
at `https://training.ozellar.com` over HTTPS (wildcard cert), the repo is at
`/opt/ozellar`, the web root is `/var/www/ozellar`, and the training videos
already exist at `/var/www/ozellar/media`.

VM: `Deployer@52.172.91.85` (Ubuntu). Run everything on the VM unless noted.
The API runs on local port **8021** (change everywhere if taken).

There is **no seed script** (`app/seed.py` was removed). The schema comes from
Alembic only; course content is authored in the admin Course Builder, and users
already exist in the database (a brand-new empty database has no admin, so the
first admin must be inserted manually).

---

## 1. Update the source

```bash
cd /opt/ozellar
git pull
```

## 2. Install Postgres + Python venv tooling

```bash
sudo apt update
sudo apt install -y postgresql python3-venv python3-pip ffmpeg
```

`ffmpeg` compresses course videos on upload (admin video upload + PPTX
media extraction) before they're stored — without it, uploads still work but
skip compression, so install it before go-live to keep storage usage down.

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

# Course-builder uploads (slide images, videos). If both are set, uploads go
# to Azure Blob Storage instead of local disk — recommended in production so
# video storage doesn't eat the VM's disk. Leave unset to store on local disk
# under backend/uploads/ (fine for dev, not recommended long-term in prod).
AZURE_STORAGE_CONNECTION_STRING=<connection string>
AZURE_CONTAINER_NAME=<container name>
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

## 6. Create / upgrade the schema

```bash
cd /opt/ozellar/backend
.venv/bin/python -m alembic upgrade head
.venv/bin/python -m alembic current      # shows the applied head
```

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
cd ../frontend && npm ci && npm run build && sudo cp -r dist/* /var/www/ozellar/   && sudo chown -R www-data:www-data /var/www/ozellar
```

Only restart the service / reload nginx / re-copy `ozellar-api.service` when that
specific file (or the backend code) changed — a frontend-only change needs just the
build and copy.

## Releasing: pre-joining briefing + admin module access

Migration `a7c3e91d4b20` adds the `briefings` / `briefing_sections` tables and the
`users.modules`, `users.department`, `users.designation` columns. Existing admins keep
access to every module (`modules` NULL = all). Nothing else (nginx, systemd, seed)
needs to change.

```bash
cd /opt/ozellar
git fetch && git checkout <branch-with-the-feature>     # or merge it first, then `git pull`
cd backend
.venv/bin/pip install -r requirements.txt               # no new packages for this release
.venv/bin/python -m alembic upgrade head                # expect: Running upgrade ... -> a7c3e91d4b20
.venv/bin/python -m alembic current                     # a7c3e91d4b20
sudo systemctl restart ozellar-api && sudo systemctl status ozellar-api --no-pager
cd ../frontend && npm ci && npm run build
sudo cp -r dist/* /var/www/ozellar/ && sudo chown -R www-data:www-data /var/www/ozellar
```

Required on the VM: `libmagic1`, `ffmpeg`, `libreoffice-impress` (already needed by
uploads / PPTX import).

One-time setup in the app after deploying:
1. Make sure at least one account has the **User management** module (it can set
   admin modules, departments and the Technical/Managing Director roles).
2. User management → edit each office admin: tick their modules, set the
   **department** for the four department briefers (QHSE / Marine / Technical /
   Manning-IT-Accounts).
3. Set one admin as **Technical Director** and one as **Managing Director** — a
   briefing can't be assigned until both exist.
4. Create a coordinator for assigning briefings: an admin with the Briefing module
   and **no department** (department briefers only see their own sections).
5. Smoke test: assign → each department approves → TD and MD approve → the officer
   confirms on `/pre-joining-briefing` → download the PDF.

Note: `ozellar-api.service` runs `-w 3`, and each worker starts the APScheduler jobs
(approval digest, SmartPAL sync), so scheduled jobs would run three times. Use
`-w 1` or move the schedulers out of worker startup before enabling SMTP/SmartPAL.

## Moving existing uploads to Azure Blob Storage

`storage.py` switches the **whole app** over to Azure the moment
`AZURE_STORAGE_CONNECTION_STRING`/`AZURE_CONTAINER_NAME` are set and the API
process restarts — there's no partial/incremental mode. Do this in order, on
a live/production system, to avoid a window where videos 404:

```bash
cd /opt/ozellar/backend
# 1. Add AZURE_STORAGE_CONNECTION_STRING and AZURE_CONTAINER_NAME to .env.
#    Do NOT restart ozellar-api yet — the running process keeps serving from
#    local disk until it's restarted, so this step alone changes nothing live.

# 2. Upload everything to Azure while still serving from local disk (safe, no downtime):
.venv/bin/python migrate_to_azure.py
# rerun if anything failed/was skipped — it's idempotent (skips blobs that already exist)

# 3. Only now restart the API so it starts reading from Azure:
sudo systemctl restart ozellar-api

# 4. Verify in the browser: open a course, confirm a video plays and seeking
#    works (Network tab should show 206 Partial Content from Azure-backed reads).

# 5. Only after step 4 passes, free the VM disk:
.venv/bin/python migrate_to_azure.py --delete-after-upload
```

`--delete-after-upload` only deletes a local file after verifying its blob
exists in Azure with a matching size, and skips `backend/uploads/photos/`
(crew ID photos, which the certificate PDF reads directly off local disk and
are not part of this migration) and any in-progress `_upload_*`/
`*.compressed.mp4` scratch files. Never run it before step 4 confirms Azure
reads are actually working.

## Troubleshooting

- **API 502 via nginx:** `sudo systemctl status ozellar-api` and
  `sudo journalctl -u ozellar-api -n 50` — usually a bad `.env` / DB password.
- **DB auth fails:** verify `DATABASE_URL` matches the Step 3 user/password and
  that `sudo -u postgres psql -c "\l"` lists `ozellar`.
- **Port 8021 taken:** pick another free port and change it in
  `ozellar-api.service` **and** `nginx-ozellar.conf`, then reload both.
- **Migrations:** `.venv/bin/python -m alembic current` shows the applied head.

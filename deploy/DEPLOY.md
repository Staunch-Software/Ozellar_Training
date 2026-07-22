# Deployment — Azure VM + nginx (static frontend, for audit)

This deploys the **frontend only** as a static site behind nginx. The app is
self-contained: login, courses, the lesson reader (with scroll-to-unlock),
assessments and certificates all work using in-browser data — **no backend or
database is required** for the audit build.

- App bundle: ~40 MB (built from git; includes slide images).
- Training videos: ~1.4 GB, **not in git** — uploaded separately (Step 5). You
  can skip them for a first pass; players will just show a poster.

Assumes an **Ubuntu** VM. Commands use `sudo`. Replace `<VM_PUBLIC_IP>` and
`azureuser` with your values.

---

## Step 1 — Open port 80 in Azure

Azure Portal → your VM → **Networking** → **Add inbound port rule**:
- Destination port ranges: `80`
- Protocol: `TCP`
- Action: `Allow`
- (Add `443` too if you'll enable HTTPS later.)

## Step 2 — SSH in and install packages

```bash
ssh azureuser@<VM_PUBLIC_IP>

sudo apt update
sudo apt install -y nginx git
# Node 20 (used only to build the static bundle)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

## Step 3 — Clone and build

```bash
cd ~
git clone https://github.com/Staunch-Software/Ozellar_Training.git
cd Ozellar_Training/frontend
npm ci
npm run build          # creates dist/ (app + slides, ~40 MB, no videos)
```

## Step 4 — Publish the build

```bash
sudo mkdir -p /var/www/ozellar
sudo cp -r dist/* /var/www/ozellar/
sudo chown -R www-data:www-data /var/www/ozellar
```

## Step 5 — Upload the videos (optional, ~1.4 GB)

The videos are git-ignored, so copy them from your local machine. Run this
**on your Windows machine** (Git Bash or PowerShell `scp`), not on the VM:

```bash
scp -r "D:/Course/frontend/public/media" azureuser@<VM_PUBLIC_IP>:/tmp/media
```

Then back **on the VM**:

```bash
sudo mkdir -p /var/www/ozellar/media
sudo cp -r /tmp/media/* /var/www/ozellar/media/
sudo chown -R www-data:www-data /var/www/ozellar/media
rm -rf /tmp/media
```

> Skip this step to deploy without videos for now.

## Step 6 — Configure nginx

```bash
sudo cp ~/Ozellar_Training/deploy/nginx-ozellar.conf /etc/nginx/sites-available/ozellar
sudo ln -sf /etc/nginx/sites-available/ozellar /etc/nginx/sites-enabled/ozellar
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t          # should say "syntax is ok" / "test is successful"
sudo systemctl reload nginx
sudo systemctl enable nginx
```

## Step 7 — Verify

Open `http://<VM_PUBLIC_IP>/` in a browser. You should see the login page;
sign in (any value) → My courses → open a course → work through lessons →
assessment → certificate.

---

## Redeploying after changes

```bash
cd ~/Ozellar_Training
git pull
cd frontend
npm ci
npm run build
sudo cp -r dist/* /var/www/ozellar/
sudo systemctl reload nginx
```

(Videos only need re-uploading if they change.)

## Later: HTTPS with a domain

Point a DNS A-record at `<VM_PUBLIC_IP>`, set `server_name yourdomain` in the
nginx config, then:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain
```

## Troubleshooting

- **403 / blank page:** check `sudo chown -R www-data:www-data /var/www/ozellar`
  and that `dist/*` (not the `dist` folder itself) was copied in.
- **Slide images or videos 404:** confirm they exist under
  `/var/www/ozellar/slides` and `/var/www/ozellar/media`.
- **Logs:** `sudo tail -f /var/log/nginx/error.log`.
- **Can't reach the site:** re-check the Azure NSG rule (Step 1) and
  `sudo systemctl status nginx`.

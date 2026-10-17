# Nasazení na ZimaOS

Image se staví na GitHubu, Zima je jen stáhne a spustí. Zatím ručně, automatický deploy přijde později.

```
PR ─► PR check (GitHub runner): testy backendu a frontendu, build image, start celého stacku
merge do main ─► Publish Docker images: ghcr.io/bzumik1/nfnn-backend a -frontend (privátní),
                 tagy latest a krátký SHA commitu
na Zimě ─► docker compose pull && docker compose up -d --wait
```

| Soubor | K čemu |
|---|---|
| `compose.yml` | Produkční stack: Postgres, denní zálohy, backend, frontend. Na Zimě leží jako `/DATA/AppData/nfnn/compose.yml`. |
| `env.example` | Vzor `/DATA/AppData/nfnn/.env`, který existuje jen na serveru. |

Kořenový `docker-compose.yml` je jen pro lokální vývoj.

## Jednorázové nastavení

### 1. Složka a tajemství

V terminálu na Zimě:

```bash
sudo mkdir -p /DATA/AppData/nfnn
cd /DATA/AppData/nfnn
sudo tee .env >/dev/null <<EOF
DB_PASSWORD=$(openssl rand -hex 24)
JWT_SECRET=$(openssl rand -hex 32)
MAIL_HOST=
MAIL_PORT=587
MAIL_USERNAME=
MAIL_PASSWORD=
MAIL_AUTH=true
MAIL_STARTTLS=true
CONTACT_RECIPIENT=info@novanadeje.cz
FRONTEND_PORT=8089
BACKUP_KEEP_DAYS=30
EOF
sudo chmod 600 .env
ss -ltn | grep ':8089 ' || echo "port 8089 je volný"
```

`DB_PASSWORD` po prvním startu neměň: Postgres si ho uloží do dat a nové heslo by backend nepustilo dovnitř. Port 8080 je na Zimě obsazený, proto 8089.

### 2. Přihlášení do ghcr.io

Image jsou privátní. GitHub → Settings → Developer settings → Personal access tokens → **Tokens (classic)** → nový token jen se scope `read:packages` (fine-grained tokeny na ghcr.io nefungují). Pak na Zimě:

```bash
sudo docker login ghcr.io -u bzumik1
```

a jako heslo vlož token. Docker si ho pamatuje, stačí jednou.

### 3. Compose soubor

Obsah `deploy/compose.yml` z repa vlož do `/DATA/AppData/nfnn/compose.yml`, třeba přes `sudo nano /DATA/AppData/nfnn/compose.yml`.

### 4. Nginx Proxy Manager

Proxy host:
- Domain: `nfnn.znamenacek.duckdns.org` (DuckDNS posílá všechny poddomény `znamenacek` na stejnou IP)
- Forward: `http` / `192.168.1.117` / `8089`
- Block common exploits: zapnuto
- SSL: nový Let's Encrypt certifikát, Force SSL, HTTP/2, HSTS

Gzip, cache a bezpečnostní hlavičky řeší nginx ve frontend image, Advanced konfigurace v NPM není potřeba.

## Nasazení nové verze

1. Mergni PR do `main` a počkej, až v Actions doběhne zeleně **Publish Docker images**.
2. Pokud PR měnil `deploy/compose.yml`, vlož jeho nový obsah do `/DATA/AppData/nfnn/compose.yml`. Pokud přidal proměnnou do `deploy/env.example`, doplň ji do `.env`.
3. Na Zimě:

```bash
cd /DATA/AppData/nfnn
sudo docker compose pull
sudo docker compose up -d --wait
```

`--wait` skončí, až jsou všechny kontejnery zdravé, nebo s chybou, když některý nenaběhne. Pak `sudo docker compose logs backend`.

Návrat na předchozí verzi: `sudo NFNN_TAG=<krátký SHA> docker compose up -d --wait`. SHA najdeš u commitu na GitHubu.

## Zálohy

Kontejner `backup` udělá `pg_dump` při každém startu a pak každých 24 hodin do `/DATA/AppData/nfnn/backups/nfnn-<datum>.dump` a maže zálohy starší než `BACKUP_KEEP_DAYS`. Leží na stejném disku jako databáze, takže je potřeba je kopírovat i mimo Zimu (ZimaOS Backup, cloud sync).

Obnova:

```bash
cd /DATA/AppData/nfnn
sudo docker compose stop backend
sudo docker compose exec -T backup sh -c 'pg_restore --clean --if-exists --dbname="$PGDATABASE" /backups/nfnn-2026-10-17_0300.dump'
sudo docker compose start backend
```

## Ruční ovládání

```bash
cd /DATA/AppData/nfnn
sudo docker compose ps
sudo docker compose logs -f backend
sudo docker compose restart backend
```

## Přechod na skutečnou doménu

Stejně jako `nakocarky.cz`: doménu na Cloudflare (proxied, SSL Full strict), CNAME na `kocarky.znamenacek.duckdns.org`, v NPM nový proxy host na stejný port 8089 a `www` přesměrovat na holou doménu. Před ostrým provozem je potřeba SMTP služba (`MAIL_*` v `.env`) a SPF/DKIM/DMARC na doméně.

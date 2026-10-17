# Nasazení na ZimaOS

Stejný model jako web kočárků: PR se kontroluje na GitHubu, merge do `main` nasadí.

```
PR ─► PR check (GitHub runner): testy backendu a frontendu, build image, start celého stacku
merge do main ─► Deploy to ZimaOS
                   1. GitHub runner postaví image a pushne je do ghcr.io (privátní)
                   2. runner na Zimě je stáhne a restartuje stack v /DATA/AppData/nfnn
                   3. ověří, že web odpovídá a /api se dostane na backend
```

| Soubor | K čemu |
|---|---|
| `compose.yml` | Produkční stack: Postgres, denní zálohy, backend, frontend. Deploy ho kopíruje do `/DATA/AppData/nfnn/compose.yml`. |
| `env.example` | Vzor `/DATA/AppData/nfnn/.env`, který existuje jen na serveru. |
| `runner-compose.yml` | Runner pro ZimaOS → App Store → Custom Install. |

Kořenový `docker-compose.yml` je jen pro lokální vývoj.

## Jednorázové nastavení

### 1. Složka a tajemství na Zimě

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

`DB_PASSWORD` po prvním startu neměň: Postgres si ho uloží do dat a nové heslo by backend nepustilo dovnitř. Port 8080 na Zimě obsazený je, proto 8089.

### 2. Runner

1. GitHub → Settings → Developer settings → Fine-grained tokens → nový token jen pro repo `bzumik1/nfnn` s jediným oprávněním **Administration: Read and write** (stejně jako u kočárků).
2. ZimaOS → App Store → Custom Install → vložit `runner-compose.yml`, do `ACCESS_TOKEN` dát token.
3. V repu Settings → Actions → Runners musí být `zima-nfnn` online.

Runner má Docker socket, takže je to de facto root na Zimě. Proto na něm běží jen `deploy.yml` po merge do `main`; nic z PR. Actions → Run workflow spouštěj jen na `main`. Repo musí zůstat privátní.

### 3. Nginx Proxy Manager

Proxy host:
- Domain: `nfnn.znamenacek.duckdns.org` (DuckDNS posílá všechny poddomény `znamenacek` na stejnou IP)
- Forward: `http` / `192.168.1.117` / `8089`
- Block common exploits: zapnuto
- SSL: nový Let's Encrypt certifikát, Force SSL, HTTP/2, HSTS

Gzip, cache a bezpečnostní hlavičky řeší nginx ve frontend image, Advanced konfigurace v NPM není potřeba.

### 4. První deploy

Merge PR do `main` (nebo Actions → Deploy to ZimaOS → Run workflow na `main`). Po zeleném běhu je web na https://nfnn.znamenacek.duckdns.org.

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

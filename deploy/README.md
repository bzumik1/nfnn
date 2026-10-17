# Nasazení na ZimaOS

Image se staví na GitHubu, ZimaOS je stáhne a spustí jako aplikaci „Nová naděje“. Zatím ručně, automatický deploy přijde později.

```
PR ─► PR check (GitHub runner): testy backendu a frontendu, build image, start celého stacku
merge do main ─► Publish Docker images: ghcr.io/bzumik1/nfnn-backend a -frontend (veřejné),
                 tagy latest a krátký SHA commitu
ZimaOS ─► aplikace „Nová naděje“ z compose.yml (App Store → Custom Install)
```

`compose.yml` je produkční stack pro ZimaOS: Postgres, denní zálohy, backend a frontend na portu 8089 (8080 je na Zimě obsazený). Kořenový `docker-compose.yml` je jen pro lokální vývoj.

## Instalace

1. Na Macu vygeneruj dvě tajemství: `openssl rand -hex 24` (heslo DB) a `openssl rand -hex 32` (JWT).
2. Zkopíruj `compose.yml` a na začátku nahraď `ZMEN_HESLO_DB` a `ZMEN_JWT_SECRET` těmi hodnotami. Do repa je nikdy necommituj.
3. ZimaOS → App Store → Custom Install → smazat vzor, vložit upravený soubor → Install.
4. Heslo DB si ulož. Po první instalaci ho neměň: Postgres si ho zapíše do dat v `/DATA/AppData/nfnn/postgres` a nové heslo by backend nepustilo dovnitř.

Když se změní `compose.yml` v repu, v ZimaOS u aplikace otevři nastavení a změny tam přenes ručně; tajemství nech, jak jsou.

## Nginx Proxy Manager

Proxy host:
- Domain: `nfnn.znamenacek.duckdns.org` (DuckDNS posílá všechny poddomény `znamenacek` na stejnou IP)
- Forward: `http` / `192.168.1.117` / `8089`
- Block common exploits: zapnuto
- SSL: nový Let's Encrypt certifikát, Force SSL, HTTP/2, HSTS

Gzip, cache a bezpečnostní hlavičky řeší nginx ve frontend image, Advanced konfigurace v NPM není potřeba.

## Nasazení nové verze

Po merge do `main` počkej, až v Actions doběhne zeleně **Publish Docker images**. Pak na Zimě stáhni nové `latest` image a restartuj aplikaci, buď v ZimaOS, nebo v terminálu:

```bash
sudo docker pull ghcr.io/bzumik1/nfnn-backend:latest
sudo docker pull ghcr.io/bzumik1/nfnn-frontend:latest
sudo docker restart nfnn-backend-1 nfnn-frontend-1
```

Pokud se kontejnery na Zimě jmenují jinak, `sudo docker ps --filter name=nfnn` je ukáže.

## Zálohy

Kontejner `backup` udělá `pg_dump` při každém startu a pak každých 24 hodin do `/DATA/AppData/nfnn/backups/nfnn-<datum>.dump` a maže zálohy starší než 30 dní. Leží na stejném disku jako databáze, takže je potřeba je kopírovat i mimo Zimu (ZimaOS Backup, cloud sync).

Obnova (název kontejneru ověř přes `sudo docker ps --filter name=nfnn`):

```bash
sudo docker stop nfnn-backend-1
sudo docker exec nfnn-backup-1 sh -c 'pg_restore --clean --if-exists --dbname="$PGDATABASE" /backups/nfnn-2026-10-17_0300.dump'
sudo docker start nfnn-backend-1
```

## Přechod na skutečnou doménu

Stejně jako `nakocarky.cz`: doménu na Cloudflare (proxied, SSL Full strict), CNAME na `kocarky.znamenacek.duckdns.org`, v NPM nový proxy host na stejný port 8089 a `www` přesměrovat na holou doménu. Před ostrým provozem je potřeba SMTP služba (`MAIL_*` u backendu) a SPF/DKIM/DMARC na doméně.

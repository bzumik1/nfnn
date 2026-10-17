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
2. Zkopíruj `compose.yml` a v textovém editoru přes Najít a nahradit nahraď `ZMEN_HESLO_DB` a `ZMEN_JWT_SECRET` těmi hodnotami. Do repa je nikdy necommituj.
3. ZimaOS → App Store → Custom Install → smazat vzor, vložit upravený soubor → Install. Hodnoty nahrazuj před vložením: ZimaOS při vložení kotvy rozbalí a heslo DB pak stojí na třech místech (`POSTGRES_PASSWORD`, `PGPASSWORD`, `DB_PASSWORD`), takže úprava jen první řádky už se nikam nepropíše.
4. Heslo DB si ulož. Po první instalaci ho neměň: Postgres si ho zapíše do dat v `/DATA/AppData/nfnn/postgres` a nové heslo by backend nepustilo dovnitř.

Když se změní `compose.yml` v repu, aplikaci přeinstaluj s novým souborem a se stejnými tajemstvími.

## Nginx Proxy Manager

Proxy host:
- Domain: `nfnn.znamenacek.duckdns.org` (DuckDNS posílá všechny poddomény `znamenacek` na stejnou IP)
- Forward: `http` / `192.168.1.117` / `8089`
- Block common exploits: zapnuto
- SSL: nový Let's Encrypt certifikát, Force SSL, HTTP/2, HSTS

Gzip, cache a bezpečnostní hlavičky řeší nginx ve frontend image, Advanced konfigurace v NPM není potřeba.

## Nasazení nové verze

Po merge do `main` počkej, až v Actions doběhne zeleně **Publish Docker images**. Pak v ZimaOS aplikaci přeinstaluj se stejným compose a stejnými tajemstvími; data v `/DATA/AppData/nfnn` zůstanou. Samotné `docker restart` nestačí, kontejner by běžel dál ze staré image.

## Zálohy

Kontejner `backup` udělá `pg_dump` při každém startu a pak každých 24 hodin do `/DATA/AppData/nfnn/backups/nfnn-<datum>.dump` a maže zálohy starší než 30 dní. Leží na stejném disku jako databáze, takže je potřeba je kopírovat i mimo Zimu (ZimaOS Backup, cloud sync).

Obnova:

```bash
sudo docker stop nfnn-backend
sudo docker exec nfnn-backup sh -c 'pg_restore --clean --if-exists --dbname="$PGDATABASE" /backups/nfnn-2026-10-17_0300.dump'
sudo docker start nfnn-backend
```

## Přechod na skutečnou doménu

Stejně jako `nakocarky.cz`: doménu na Cloudflare (proxied, SSL Full strict), CNAME na `kocarky.znamenacek.duckdns.org`, v NPM nový proxy host na stejný port 8089 a `www` přesměrovat na holou doménu. Před ostrým provozem je potřeba SMTP služba (`MAIL_*` u backendu) a SPF/DKIM/DMARC na doméně.

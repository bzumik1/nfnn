# Nasazení na ZimaOS

Image se staví na GitHubu, runner na Zimě je stáhne a spustí. Stejně jako u kočárek nasazuje merge do `main`.

```
PR ─► PR check (GitHub runner): testy backendu a frontendu, build image, start celého stacku
merge do main ─► Publish and deploy:
                 1. GitHub runner postaví a pošle ghcr.io/bzumik1/nfnn-backend a -frontend (veřejné),
                    tagy latest a krátký SHA commitu
                 2. runner na Zimě: docker compose pull + up, počká, až je vše healthy, a ověří web i backend
```

`compose.yml` je produkční stack: Postgres, denní zálohy, backend a frontend na portu 8089 (8080 je na Zimě obsazený). Runner ho spouští jako běžný docker compose projekt `nfnn`, ne jako aplikaci ZimaOS. Kořenový `docker-compose.yml` je jen pro lokální vývoj.

Runner běží jen pro push do `main`, nikdy pro PR: má přístup k Dockeru na Zimě, takže neschválený kód na něj nesmí. Proto musí repo zůstat soukromé.

## Jednorázové nastavení

1. **Hesla.** Přes SSH na Zimě vytvoř soubor s oběma tajemstvími:

   ```bash
   sudo mkdir -p /DATA/AppData/nfnn
   sudo nano /DATA/AppData/nfnn/secrets.env
   sudo chmod 600 /DATA/AppData/nfnn/secrets.env
   ```

   Obsah:

   ```
   DB_PASSWORD=...
   JWT_SECRET=...
   ```

   Na novém serveru je vygeneruj (`openssl rand -hex 24` a `openssl rand -hex 32`). Když už databáze v `/DATA/AppData/nfnn/postgres` existuje, `DB_PASSWORD` musí být heslo, se kterým vznikla, jinak se backend nepřihlásí. Soubor musí existovat dřív, než se nainstaluje runner, jinak Docker na jeho místě založí prázdnou složku.

2. **Stará aplikace.** Pokud je v ZimaOS nainstalovaná aplikace „Nová naděje“ z dřívějška, odinstaluj ji (data nemazat). Jinak by její kontejnery `nfnn-*` blokovaly názvy, až runner poprvé nasadí.

3. **Token.** GitHub → Settings → Developer settings → Fine-grained tokens → nový token jen pro repo `bzumik1/nfnn`, oprávnění Administration: Read and write (stejně jako u kočárek).

4. **Runner.** ZimaOS → App Store → Custom Install → vložit `runner-compose.yml`, do `ACCESS_TOKEN` dát token → Install. Za chvíli se v GitHubu v Settings → Actions → Runners objeví `zima-nfnn` jako Idle.

5. **První nasazení.** Pokud na runner čeká běh z dřívějšího merge, spustí se sám. Jinak GitHub → Actions → Publish and deploy → Run workflow. Pak už nasazuje každý merge.

## Nginx Proxy Manager

Proxy host:
- Domain: `nfnn.znamenacek.duckdns.org` (DuckDNS posílá všechny poddomény `znamenacek` na stejnou IP)
- Forward: `http` / `192.168.1.117` / `8089`
- Block common exploits: zapnuto
- SSL: nový Let's Encrypt certifikát, Force SSL, HTTP/2, HSTS

Gzip, cache a bezpečnostní hlavičky řeší nginx ve frontend image, Advanced konfigurace v NPM není potřeba.

## Ruční zásah

Stav a logy: `sudo docker ps --filter name=nfnn` a `sudo docker logs nfnn-backend`. Nasazení zopakuješ přes Run workflow. Návrat ke starší verzi: v GitHubu revert commitu a merge, runner nasadí předchozí stav.

## Zálohy

Kontejner `nfnn-backup` udělá `pg_dump` při každém startu a pak každých 24 hodin do `/DATA/AppData/nfnn/backups/nfnn-<datum>.dump` a maže zálohy starší než 30 dní. Leží na stejném disku jako databáze, takže je potřeba je kopírovat i mimo Zimu (ZimaOS Backup, cloud sync).

Obnova:

```bash
sudo docker stop nfnn-backend
sudo docker exec nfnn-backup sh -c 'pg_restore --clean --if-exists --dbname="$PGDATABASE" /backups/nfnn-2026-10-17_0300.dump'
sudo docker start nfnn-backend
```

## Přechod na skutečnou doménu

Stejně jako `nakocarky.cz`: doménu na Cloudflare (proxied, SSL Full strict), CNAME na `kocarky.znamenacek.duckdns.org`, v NPM nový proxy host na stejný port 8089 a `www` přesměrovat na holou doménu. Před ostrým provozem je potřeba SMTP služba (`MAIL_*` u backendu) a SPF/DKIM/DMARC na doméně.

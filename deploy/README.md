# Nasazení na ZimaOS

Image se staví na GitHubu, ZimaOS je stáhne a spustí jako aplikaci „Nová naděje“. Zatím ručně, automatický deploy přijde později.

```
PR ─► PR check (GitHub runner): testy backendu a frontendu, build image, start celého stacku
merge do main ─► Publish Docker images: ghcr.io/bzumik1/nfnn-backend, -frontend, -backup a -ops (veřejné),
                 tagy latest a krátký SHA commitu
ZimaOS ─► aplikace „Nová naděje“ z compose.yml (App Store → Custom Install)
```

`compose.yml` je produkční stack pro ZimaOS: Postgres, zálohy, backend, frontend na portu 8089 (8080 je na Zimě obsazený) a dvojice `ops` + `cloudflared`, přes kterou Claude čte logy (viz [Logy pro Clauda](#logy-pro-clauda)). Kořenový `docker-compose.yml` je jen pro lokální vývoj.

## Hesla a nastavení serveru

Hesla, tokeny a nastavení, která patří jen tomuto serveru, nejsou v `compose.yml`, ale ve třech souborech na disku ZimaOS. `compose.yml` se proto do ZimaOS vkládá vždy beze změn.

| Soubor | Obsah | Čte ho |
|---|---|---|
| `/DATA/AppData/nfnn/env/db.env` | heslo databáze, stejné na třech řádcích `POSTGRES_PASSWORD`, `PGPASSWORD` a `DB_PASSWORD` | Postgres, zálohy, backend |
| `/DATA/AppData/nfnn/env/backend.env` | `JWT_SECRET`, `FIO_TOKEN`, SMTP (`MAIL_*`) a volitelná nastavení backendu | jen backend |
| `/DATA/AppData/nfnn/env/ops.env` | `TUNNEL_TOKEN` tunelu Cloudflare, kterým Claude čte logy | jen cloudflared |

Vzory jsou v repu jako `deploy/db.env.example`, `deploy/backend.env.example` a `deploy/ops.env.example`; co který řádek znamená, říká komentář nad ním. Vyplněné soubory do repa nepatří, `.gitignore` všechny `*.env` ignoruje. Postgres a zálohy `backend.env` nedostanou, takže token Fio, heslo SMTP ani JWT klíč v databázových kontejnerech nejsou.

- Hodnoty piš bez uvozovek. Nesmí obsahovat `$` (docker compose ho bere jako začátek proměnné a hodnota se zkomolí) ani mezeru před `#` (od ní dál je komentář). Hesla z `openssl rand -hex 32` mají jen číslice a písmena a–f.
- Volitelný řádek buď vyplň, nebo nech zakomentovaný (`#` na začátku). Prázdná hodnota není totéž co chybějící řádek: prázdné `MAIL_FROM`, `CONTACT_RECIPIENT`, `REPORT_RECIPIENT`, `PUBLIC_URL`, `RECEIPT_SIGNATORY_NAME` nebo `RECEIPT_SIGNATORY_ROLE` zastaví start backendu (prázdné `CONTACT_RECIPIENT` bez `MAIL_FROM` hlásí chybu `MAIL_FROM (app.mail.sender-email) is required`).
- **Po každé změně souboru aplikaci přeinstaluj** (vlož znovu `deploy/compose.yml`). ZimaOS si při instalaci zkopíruje hodnoty ze souborů do své kopie compose jako `environment:` a ty mají přednost. Restart ani `docker compose up --force-recreate` proto nové hodnoty nenačtou, kontejner dostane ty z poslední instalace. Co kontejner opravdu vidí, ukáže bez prozrazení hodnot `sudo docker exec nfnn-backend printenv | awk -F= '/^MAIL_/{print $1, length($0)-length($1)-1}'` (délka 0 = prázdné).
- ZimaOS při tom kopírování čte hodnoty jako YAML, takže datum převede na čas: z `FIO_HISTORY_FROM=2025-01-01` udělá `2025-01-01 00:00:00 +0000 UTC` a tak ho ukáže i v nastavení aplikace. Backend tenhle tvar přijme (do opravy v říjnu 2026 na něm nenastartoval s chybou `Text '2025-01-01 00:00:00 +0000 UTC' could not be parsed`). Ostatní řádky vzoru nic takového nepotkává: port, rok a `true` zůstanou, jak jsou, a e-maily, adresy, cesty, tokeny ani čísla účtů YAML za datum ani číslo nepovažuje.
- Soubory musí existovat před instalací. Chybí-li některý, instalace skončí chybou, která jmenuje chybějící soubor (`/DATA/AppData/nfnn/env/db.env`, `backend.env` nebo `ops.env`) a hlásí `no such file or directory` nebo `not found`.
- Kdyby ZimaOS compose s `env_file` odmítla, vrať se k dřívějšímu postupu s hesly přímo v compose: starý `deploy/compose.yml` i tento návod k němu jsou v historii gitu (`git log -p -- deploy/compose.yml deploy/README.md`).

## Instalace

1. Na Macu v kořeni repa zkopíruj vzory na ZimaOS (`<uživatel>` je tvůj uživatel na ní):

   ```bash
   scp deploy/db.env.example deploy/backend.env.example deploy/ops.env.example <uživatel>@192.168.1.117:/tmp/
   ```

2. Přes SSH na ZimaOS z nich založ soubory, které smí číst jen root, složku pro sken podpisu a složky pro zálohy, obnovu a logy:

   ```bash
   sudo install -d -m 700 /DATA/AppData/nfnn/env
   sudo install -d -m 755 /DATA/AppData/nfnn/config /DATA/AppData/nfnn/backups /DATA/AppData/nfnn/restore /DATA/AppData/nfnn/logs
   sudo install -m 600 /tmp/db.env.example /DATA/AppData/nfnn/env/db.env
   sudo install -m 600 /tmp/backend.env.example /DATA/AppData/nfnn/env/backend.env
   sudo install -m 600 /tmp/ops.env.example /DATA/AppData/nfnn/env/ops.env
   rm /tmp/db.env.example /tmp/backend.env.example /tmp/ops.env.example
   ```

3. Heslo databáze a JWT klíč vygeneruj rovnou do souborů. Heslo se zapíše na všechny tři řádky `db.env` a ani jedna hodnota se neukáže na obrazovce ani nezůstane v historii shellu:

   ```bash
   sudo sh -c 'p=$(openssl rand -hex 32) && sed -i -E "s/^(POSTGRES_PASSWORD|PGPASSWORD|DB_PASSWORD)=.*/\1=$p/" /DATA/AppData/nfnn/env/db.env'
   sudo sh -c 'j=$(openssl rand -hex 32) && sed -i -E "s/^JWT_SECRET=.*/JWT_SECRET=$j/" /DATA/AppData/nfnn/env/backend.env'
   ```

   Nemá-li ZimaOS `openssl`, napiš v obou příkazech místo `openssl rand -hex 32` tohle: `head -c 32 /dev/urandom | od -An -tx1 | tr -d " \n"`.

4. Token tunelu Cloudflare doplň do `ops.env` podle [Logy pro Clauda](#logy-pro-clauda); bez něj kontejner `nfnn-cloudflared` jen dokola startuje a všechno ostatní běží. Token Fio a SMTP doplň do `backend.env`, máš-li je (`sudo vi /DATA/AppData/nfnn/env/backend.env`; viz [Fio API](#fio-api) a [Obnova hesla](#obnova-hesla)). Prázdné nech, dokud je nemáš: bez tokenu je import plateb vypnutý a bez SMTP e-maily neodcházejí. Které řádky mají hodnotu, ukáže (hodnoty samotné nevypíše):

   ```bash
   sudo grep -E '^[A-Z_]+=' /DATA/AppData/nfnn/env/db.env /DATA/AppData/nfnn/env/backend.env | sed -E 's/=.+/=(vyplněno)/'
   ```

   `POSTGRES_PASSWORD`, `PGPASSWORD`, `DB_PASSWORD` a `JWT_SECRET` musí být `(vyplněno)`.

5. Stěhuješ-li data z jiného serveru nebo ze zálohy, dej teď jeden soubor `.dump` do `/DATA/AppData/nfnn/restore/` (viz [Obnova](#obnova)); kontejner záloh ho při prvním startu nahraje do prázdné databáze a backend počká, než bude hotovo.
6. ZimaOS → App Store → Custom Install → smazat vzor, vložit `deploy/compose.yml` beze změn → Install.
7. Heslo databáze po první instalaci neměň: Postgres si ho zapíše do dat v `/DATA/AppData/nfnn/postgres` a nové heslo by backend nepustilo dovnitř. Nový JWT klíč jen odhlásí všechny dárce.

Když se změní `compose.yml` v repu, aplikaci přeinstaluj s novým souborem; soubory v `/DATA/AppData/nfnn/env` zůstanou, jak jsou. Přibude-li nebo změní-li se řádek ve vzoru (`deploy/*.env.example`), přepiš ho před přeinstalací do souboru v `/DATA/AppData/nfnn/env`.

## Přechod na env soubory

Server nainstalovaný ze staršího `compose.yml` má hesla přímo v compose (kotvy `ZMEN_HESLO_DB` a `ZMEN_JWT_SECRET`, ručně přidané řádky jako `FIO_TOKEN`). Jednorázový přechod, dokud aplikace ještě běží se starým compose:

1. Zkopíruj vzory a založ soubory jako v krocích 1 a 2 instalace, ale nic negeneruj.
2. Hodnoty, se kterými aplikace běží teď, do souborů přenes z běžících kontejnerů. Heslo databáze tak zůstane stejné (Postgres ho má uložené od prvního startu) a stejný zůstane i JWT klíč, takže se nikdo neodhlásí. Na ZimaOS nejdřív spusť `sudo -s` a pak vlož:

   ```bash
   umask 077
   cd /DATA/AppData/nfnn/env
   for c in nfnn-postgres nfnn-backup nfnn-backend; do docker inspect "$c" --format '{{range .Config.Env}}{{println .}}{{end}}'; done | grep -E '^(POSTGRES_PASSWORD|PGPASSWORD|DB_PASSWORD|JWT_SECRET|FIO_TOKEN|FIO_HISTORY_FROM|MAIL_[A-Z]+|CONTACT_RECIPIENT|PUBLIC_URL|RECEIPT_[A-Z_]+)=' > current.env
   fill() { awk -F= 'FILENAME == ARGV[1] { v[$1] = substr($0, length($1) + 2); next } { k = $0; sub(/^#/, "", k); sub(/=.*/, "", k) } (k in v) && !(k in done) { print k "=" v[k]; done[k] = 1; next } { print }' current.env "$1"; }
   fill db.env > db.env.new && mv db.env.new db.env
   fill backend.env > backend.env.new && mv backend.env.new backend.env
   rm current.env
   grep -E '^[A-Z_]+=' db.env backend.env | sed -E 's/=.+/=(vyplněno)/'
   exit
   ```

   Každá hodnota z kontejnerů nahradí stejnojmenný řádek vzoru, i zakomentovaný. Výpis na konci ukáže, které řádky mají hodnotu: `POSTGRES_PASSWORD`, `PGPASSWORD`, `DB_PASSWORD` a `JWT_SECRET` musí být `(vyplněno)`. Neběží-li kontejnery, hodnoty najdeš v compose, který si ZimaOS uložila; tenhle příkaz je vypíše na obrazovku a do souborů je pak přepiš ručně (`sudo vi`):

   ```bash
   f=$(sudo grep -rl 'nfnn-frontend' /var/lib/casaos/apps | head -1)
   sudo grep -nE 'PASSWORD|JWT_SECRET|FIO_|MAIL_|CONTACT_RECIPIENT|PUBLIC_URL|RECEIPT_' "$f"
   ```

3. Chybí-li ještě token Fio nebo SMTP, doplň je do `backend.env` (`sudo vi /DATA/AppData/nfnn/env/backend.env`).
4. Připojoval-li starý compose sken podpisu z `/DATA/AppData/nfnn/receipt`, zkopíruj ho do `config`; nepřesouvej ho, starý compose ho potřebuje, dokud aplikaci nepřeinstaluješ: `sudo install -m 644 /DATA/AppData/nfnn/receipt/signature.png /DATA/AppData/nfnn/config/signature.png`. Sken `.jpg` nebo `.jpeg` zkopíruj stejně, jen s jeho příponou v obou cestách, aby dál seděl přenesený řádek `RECEIPT_SIGNATURE_IMAGE` (třeba `/config/signature.jpg`). Nový compose připojuje celou složku `config` jako `/config`. Složku `/DATA/AppData/nfnn/receipt` smaž, až log nové instalace v kroku 6 ukáže `Started AppApplication`.
5. Aplikaci přeinstaluj s novým `deploy/compose.yml`, vloženým beze změn.
6. Zkontroluj log backendu: `sudo docker logs nfnn-backend 2>&1 | grep -E 'Started AppApplication|JWT_SECRET|password authentication failed'`. Má tam být `Started AppApplication`. `JWT_SECRET (app.security.jwt.secret) is required` znamená prázdný nebo chybějící `JWT_SECRET` v `backend.env`; `password authentication failed` znamená jiné heslo databáze, než s jakým Postgres poprvé startoval. Postgres a zálohy JWT klíč vidět nesmí: `sudo docker exec nfnn-postgres printenv JWT_SECRET` nevypíše nic.

## Nginx Proxy Manager

Proxy host:
- Domain: `nfnn.znamenacek.duckdns.org` (DuckDNS posílá všechny poddomény `znamenacek` na stejnou IP)
- Forward: `http` / `192.168.1.117` / `8089`
- Block common exploits: zapnuto
- SSL: nový Let's Encrypt certifikát, Force SSL, HTTP/2, HSTS

Gzip, cache a bezpečnostní hlavičky řeší nginx ve frontend image, Advanced konfigurace v NPM není potřeba.

## Nasazení nové verze

Po merge do `main` počkej, až v Actions doběhne zeleně **Publish Docker images**. Pak v ZimaOS otevři nastavení aplikace „Nová naděje“ a klikni na **Uložit** bez jakékoli změny: ZimaOS stáhne nové image `latest` a kontejnery vytvoří znovu; data i env soubory v `/DATA/AppData/nfnn` zůstanou. Tlačítko Update to neudělá (u tagu `latest` aplikaci považuje za aktuální) a samotné `docker restart` taky ne, kontejner by běžel dál ze staré image. Merge, který mění jen dokumentaci (nic v `backend/` ani `frontend/`), nové image nevydá a nasazovat není co.

Kterou verzi kontejnery mají, ukáže commit, ze kterého image vznikla; má se shodovat s commitem běhu **Publish Docker images**:

```bash
sudo docker inspect nfnn-backend nfnn-frontend nfnn-backup nfnn-ops --format '{{.Name}} {{index .Config.Labels "org.opencontainers.image.revision"}}'
```

Uložení bere compose z poslední instalace, takže změnu `compose.yml` nebo env souborů nepřenese; na ty je dál potřeba přeinstalace.

## Zálohy

Kontejner `nfnn-backup` (image `ghcr.io/bzumik1/nfnn-backup`, skript `deploy/backup/backup.sh`) udělá `pg_dump` při každém startu a pak každou noc ve 3:00 pražského času do `/DATA/AppData/nfnn/backups/nfnn-<datum>_<čas>.dump` a maže zálohy starší než 30 dní. Každou neděli ve 4:00 nejnovější zálohu zkušebně obnoví do dočasné databáze `nfnn_restore_test`, spočítá tabulky a databázi zase smaže, takže se včas pozná záloha, ze které by se obnovit nedalo. Výsledek každého běhu je v logu kontejneru (`sudo docker logs nfnn-backup`) a v souborech `/DATA/AppData/nfnn/backups/status/`, které čte backend: správce ho vidí ve správě na stránce **Zálohy** (`/sprava/zalohy`), kde také spustí zálohu nebo zkušební obnovu hned a zálohu si stáhne (každé stažení je v historii správy, dump obsahuje údaje všech dárců). Když záloha chybí, selhala nebo je starší než den, nebo zkušební obnova chybí, selhala nebo je starší než 8 dní, pošle backend po ranní kontrole (7:15) e-mail příjemcům měsíčního přehledu, jednou za poruchu a jednou, až zase všechno funguje.

Dump je komprimovaný zstd na úrovni 19, nejvyšší, která se vejde do limitu 256 MB paměti kontejneru (úroveň 20 nic neušetří a potřebuje kolem 170 MB, úroveň 22 kontejner zabije). Na zkušebních datech byl proti dřívějšímu gzipu asi o čtvrtinu menší; `pg_restore` kompresi pozná sám, takže obnova i starší zálohy v gzipu fungují stejně. Zálohy leží na stejném disku jako databáze, takže je potřeba je kopírovat i mimo Zimu (ZimaOS Backup, cloud sync, nebo stažení ze stránky Zálohy). Složky `env/` a `config/` záloha nekopíruje; jejich obsah (hesla, tokeny, podpis) si ulož do správce hesel.

Zálohu na požádání, třeba před aktualizací, spustí správce tlačítkem **Zálohovat teď** na `/sprava/zalohy` (soubor dostane příponu `-rucni`). Z příkazové řádky to samé udělá prázdný soubor ve složce požadavků, kontejner si ho do 10 sekund vezme (`rucni.test-restore` místo `.backup` spustí zkušební obnovu):

```bash
sudo touch /DATA/AppData/nfnn/backups/requests/rucni.backup
```

### Obnova

Zálohu obnovuje kontejner `nfnn-backup` při svém startu ze složky `/DATA/AppData/nfnn/restore/`:

1. Dej do složky právě jeden soubor s příponou `.dump` (ze `backups/`, ze zálohy stažené ze stránky Zálohy, nebo z jiného serveru), např.:

   ```bash
   sudo cp /DATA/AppData/nfnn/backups/nfnn-2026-10-17_0300.dump /DATA/AppData/nfnn/restore/
   ```

2. Restartuj aplikaci: v ZimaOS v nastavení aplikace „Nová naděje“ klikni na **Uložit**, nebo `sudo docker restart nfnn-backup nfnn-backend`. Backend čeká, dokud ve složce leží `.dump`; kontejner záloh ukončí ostatní připojení, vyprázdní schéma `public`, nahraje dump a soubor přejmenuje na `.dump.done`; pak backend nastartuje a Liquibase doplní změny databáze, které jsou v běžící verzi novější než záloha.

Pravidla: do **prázdné** databáze (nový server, smazaná složka `postgres/`) se takhle obnoví i úplně první start, stačí dát dump do `restore/` před instalací. Do databáze, která **už data má**, kontejner dump neobnoví a přejmenuje ho na `.dump.skipped`; chceš-li ji přepsat, pojmenuj soubor `*.force.dump` – kontejner nejdřív udělá zálohu `-pred-obnovou` a pak databázi nahradí. Víc souborů `.dump` ve složce se přeskočí všechny. Když `pg_restore` skončí chybou, soubor dostane příponu `.dump.failed`, schéma zůstane prázdné a backend **nenastartuje**, dokud soubor ve složce leží (jinak by si Liquibase založil novou prázdnou databázi): dej do složky zálohu `-pred-obnovou` nebo jiný dump a restartuj znovu, nebo `.failed` soubor smaž, chceš-li opravdu začít s prázdnou databází. Jak to dopadlo, je v logu kontejneru a na `/sprava/zalohy` (řádek „Složka restore“ a poslední chyba). Soubory `.done`, `.failed` a `.skipped` smaž, až je nebudeš potřebovat.

Proč prázdné schéma: `pg_restore --clean` nestačí, smaže jen to, co v záloze je, takže tabulky z novější verze zůstanou, zatímco tabulka Liquibase se vrátí do stavu zálohy, a backend pak při startu spadne na pokusu založit tabulku, která už existuje. Kdyby kontejner záloh neběžel, udělá to samé ručně:

```bash
sudo docker stop nfnn-backend
sudo docker exec nfnn-backup sh -c 'pg_dump --format=custom --compress=zstd:19 --file="/backups/nfnn-`date +%Y-%m-%d_%H%M`-pred-obnovou.dump"'
sudo docker exec nfnn-backup psql -v ON_ERROR_STOP=1 -c 'DROP SCHEMA public CASCADE' -c 'CREATE SCHEMA public'
sudo docker exec nfnn-backup pg_restore --exit-on-error --single-transaction --dbname=novanadeje /backups/nfnn-2026-10-17_0300.dump
sudo docker start nfnn-backend
```

### Návrat na předchozí verzi

Každá image má vedle `latest` i tag se zkráceným commitem (7 znaků, např. `418105c`), seznam je v GitHubu u balíčků `nfnn-backend`, `nfnn-frontend`, `nfnn-backup` a `nfnn-ops`. V nastavení aplikace „Nová naděje“ v ZimaOS změň u backendu a frontendu (a zálohování nebo ops, měnily-li se) tag z `latest` na commit předchozí verze a klikni na **Uložit**. Zpátky na nejnovější verzi se vrátíš tagem `latest`.

Pokud novější verze měnila databázi (v jejím commitu přibyl soubor v `backend/src/main/resources/db/changelog/`), starší backend s novější databází fungovat nemusí. Pak po změně tagu obnov zálohu z doby před aktualizací (viz Obnova); dary a registrace mezi zálohou a obnovou se ztratí, platby z banky z posledních 90 dní se ale při dalším stažení z Fio doplní znovu. Proto před aktualizací, která mění databázi, udělej zálohu na požádání.

## Logy pro Clauda

Backend píše svůj log kromě `docker logs` i do souboru `/DATA/AppData/nfnn/logs/backend.log` (rotace po 10 MB, 14 dní, nejvýš 200 MB; složku si při startu převezme uživatel `app`, pod kterým Java běží) a zálohování připisuje výsledky do `backup.log` ve stejné složce. Při startu backend zapíše řádek `Backend revision <commit> is ready` a totéž vrací `/actuator/info`, takže je vidět, kterou verzi Zima právě spouští. Kontejner `nfnn-ops` (nginx) složku jen pro čtení vystavuje na `/logs/` a přeposílá `/health` a `/info` na backend; žádný port na routeru neotvírá. Ven ho dostane `nfnn-cloudflared`: spojení jde jen ze Zimy do Cloudflare, na adrese `ops.nfnn.cz` sedí Cloudflare Access a pustí jen servisní token (Claude) a tvůj e-mail (prohlížeč). Token tunelu jde při úniku zrušit v Cloudflare během minuty a dovoluje jen číst logy; `JWT_SECRET`, heslo databáze ani Fio token se do logů nedostanou (knihovna Fio je v chybách maskuje).

Nastavení v Cloudflare (jednou, asi 30 minut; doména `nfnn.cz` už u Cloudflare je):

1. [Zero Trust](https://one.dash.cloudflare.com) → Networks → Tunnels → **Create a tunnel** → Cloudflared → název `nfnn-ops`. Z nabídnutého příkazu pro Docker zkopíruj jen hodnotu za `--token` (dlouhý řetězec `eyJ…`) do `/DATA/AppData/nfnn/env/ops.env` jako `TUNNEL_TOKEN=…`. Příkaz samotný nespouštěj, kontejner je v compose.
2. V tunelu → Public Hostname → **Add a public hostname**: subdomain `ops`, domain `nfnn.cz`, type HTTP, URL `ops:80`. Cloudflare sám založí DNS záznam `ops.nfnn.cz`.
3. Access → Service Auth → Service Tokens → **Create Service Token**: název `claude-nfnn`, platnost podle uvážení (po vypršení ho vytvoříš znovu). Client ID a Client Secret se ukážou jen jednou: ulož je do prostředí projektu na claude.ai jako `NFNN_OPS_CLIENT_ID` a `NFNN_OPS_CLIENT_SECRET` (stejně jako `FIO_TOKEN`).
4. Access → Applications → **Add an application** → Self-hosted: název `NFNN logy`, domain `ops.nfnn.cz`. Dvě pravidla: `Claude` s akcí **Service Auth** a podmínkou Service Token = `claude-nfnn`; `Jakub` s akcí **Allow** a podmínkou Emails = tvůj e-mail (přihlásíš se jednorázovým kódem z e-mailu).
5. Na Zimě založ složku `logs` a soubor `ops.env` (krok 2 Instalace, pokud ještě nejsou) a aplikaci přeinstaluj s aktuálním `deploy/compose.yml`.

Kontrola z libovolného počítače (hodnoty tokenu dosaď; Claude má totéž v prostředí projektu):

```bash
curl -sS -H "CF-Access-Client-Id: $NFNN_OPS_CLIENT_ID" -H "CF-Access-Client-Secret: $NFNN_OPS_CLIENT_SECRET" https://ops.nfnn.cz/info
curl -sS -H "CF-Access-Client-Id: $NFNN_OPS_CLIENT_ID" -H "CF-Access-Client-Secret: $NFNN_OPS_CLIENT_SECRET" -H 'Range: bytes=-20000' https://ops.nfnn.cz/logs/backend.log
```

V prohlížeči otevři https://ops.nfnn.cz/logs/ a přihlas se e-mailem. Když tunel neběží (`sudo docker logs nfnn-cloudflared` hlásí chybu tokenu), zbytek webu to neovlivní; logy jsou dál v `docker logs` a v souborech na disku. Co v logu není: compose uložený ZimaOS, proměnné v kontejnerech a kontejner, který ZimaOS vůbec nevytvořil; na to zůstává tvůj příkaz na Zimě.

## MCP konektor

Správce může Claudovi (na claude.ai, v mobilu i v Claude Code) dát přístup do správy fondu konektorem na adrese `https://nfnn.cz/mcp` (na stagingu `https://nfnn.znamenacek.duckdns.org/mcp`). Běží v kontejneru `nfnn-mcp` za frontendovým nginxem, nemá žádné heslo ani klíč: přihlášení jde přes samotný web (stránka `/pripojeni`, účet správce s dvoufaktorovým ověřením) a každý nástroj volá stejná `/api/admin/...` jako web, takže vše je v historii správy pod jménem správce. Nástroje: stav importu a verze, přehled roku, platby, dárci, zálohy, historie správy, report, aktuality a projekty, konec logů; se zápisem navíc spárování a odpárování platby, odeslání reportu, vyžádání zálohy nebo zkušební obnovy a publikování aktualit a projektů. Nic nového v `env/` ani v Cloudflare.

1. Po merge: na Zimě aplikaci odinstaluj a znovu nainstaluj s aktuálním `deploy/compose.yml` (nová služba `mcp`; Save nestačí, stejně jako u záloh a logů). Kontrola: `sudo docker ps` ukáže `nfnn-mcp` jako healthy a `curl -sS -o /dev/null -w '%{http_code}\n' -X POST https://nfnn.cz/mcp` vrátí `401`.
2. V claude.ai: Nastavení → Konektory → **Přidat vlastní konektor** → název `NFNN`, adresa `https://nfnn.cz/mcp`, nic dalšího (klient se představí sám). Po uložení klikni na Připojit: otevře se web fondu, přihlas se účtem správce včetně kódu z aplikace a na stránce „Povolit přístup ke správě aplikaci claude.ai?“ zvol Povolit. Od té chvíle má Claude v chatu nástroje `nfnn_…`; pro zápis si vyžádá oprávnění „admin:write“ a web se zeptá znovu.
3. V Claude Code na počítači: `claude mcp add --transport http nfnn https://nfnn.cz/mcp` a při prvním použití `/mcp` → přihlášení v prohlížeči stejně jako výše (stránka upozorní, že jde o aplikaci na tomto počítači).
4. Odpojení: přehled dárce → karta „Přihlašovací údaje“ → „Připojené aplikace“ → Odpojit. Připojení skončí také změnou hesla, vypnutím dvoufaktorového ověření nebo odebráním role správce; bez použití vyprší po 14 dnech.

Když konektor neodpovídá: `sudo docker logs nfnn-mcp` (při startu zapíše `Authorization server discovered: https://nfnn.cz`; dokud se k backendu nedostane, hlásí `/health` 503 a ZimaOS ho ukazuje jako starting) a `sudo docker logs nfnn-frontend` (nginx hlásí `limiting requests` při více než 10 požadavcích za sekundu z jedné adresy). Konektor sám nic neukládá, takže ho lze kdykoli restartovat.

## Přechod na skutečnou doménu

Doména fondu je `nfnn.cz` (u WEDOS, držitel fond). Nastavuje se jako `nakocarky.cz`:

1. V Cloudflare (plán Free) přidej `nfnn.cz` a u WEDOS přepni NSSET na nameservery, které Cloudflare ukáže. DNSSEC nech vypnuté.
2. DNS v Cloudflare: `nfnn.cz` CNAME `nfnn.znamenacek.duckdns.org` a `www` CNAME `nfnn.cz`, obojí Proxied; SSL/TLS v režimu Full (strict).
3. V NPM nový proxy host `nfnn.cz` na port 8089 s certifikátem Let's Encrypt a Force SSL, a `www.nfnn.cz` přesměrovat 301 na `https://nfnn.cz`. V Advanced konfiguraci proxy hostu brát adresu návštěvníka z `CF-Connecting-IP` (viz Obnova hesla).
4. V `backend.env` nastav `PUBLIC_URL=https://nfnn.cz`, jinak odkazy v e-mailech vedou na starou adresu, a aplikaci přeinstaluj.

## E-maily

Adresa fondu je `info@nfnn.cz`. Příchozí poštu přeposílá Cloudflare Email Routing do běžných schránek, web odesílá přes Brevo (SMTP, zdarma 300 e-mailů denně). Odesílatel je `CONTACT_RECIPIENT`, takže odpověď na e-mail z webu dojde fondu.

1. Cloudflare → Email → Email Routing: zapni ho, ověř cílovou schránku a v Routing rules založ `info@nfnn.cz` → tu schránku. MX, SPF (`v=spf1 include:_spf.mx.cloudflare.net ~all`) a DKIM pro přeposílání přidá Cloudflare sám a zamkne je; Catch-all nech vypnutý.
2. Brevo: účet fondu (plán Free), Senders, Domains & Dedicated IPs → Domains → přidej `nfnn.cz`, brandovanou subdoménu přeskoč a zvol ruční přidání záznamů (Manual). Do Cloudflare přidej čtyři záznamy přesně podle Brevo: TXT `brevo-code:…` na `nfnn.cz`, CNAME `brevo1._domainkey` a `brevo2._domainkey` (DNS only, šedý mráček, ne Proxied) a TXT na `_dmarc` (`v=DMARC1; p=none; rua=mailto:rua@dmarc.brevo.com`). Až e-maily z webu chodí bez spamu, zpřísni DMARC na `p=quarantine`.
3. SPF neměň: Brevo odesílá z vlastní odesílací domény a za `nfnn.cz` se prokazuje podpisem DKIM, takže DMARC projde i bez `include:spf.brevo.com`. Brevo u transakčních e-mailů sleduje otevření a kliky a odkazy v HTML části vede přes svůj server (`sendibt3.com`); na plánu Free to vypnout nejde, jen na žádost u Enterprise. Odkaz pro obnovu hesla v textové části vede přímo na web a token Brevo vidí v obsahu e-mailu tak jako tak, takže to nevadí. Objeví-li se v Transactional → Settings přepínač sledování, vypni ho.
4. Brevo → SMTP & API → SMTP: vygeneruj SMTP klíč (Standard, bez expirace; Brevo ho i tak zruší po 90 dnech bez použití). Vzor `backend.env` už má `MAIL_HOST=smtp-relay.brevo.com`, port, login účtu fondu `bebb0c001@smtp-brevo.com` a STARTTLS; doplň jen `MAIL_PASSWORD` (SMTP klíč) a aplikaci přeinstaluj.
5. Vyzkoušej kontaktní formulář: zpráva musí dojít na `info@nfnn.cz` a v jejích hlavičkách musí být `dkim=pass` a `dmarc=pass`.

Zprávy z kontaktního formuláře backend každý den ve 3:30 maže z databáze, jakmile jsou starší než rok (vlastnost `app.contact.retention.max-age`, výchozí `P365D`; v logu `Deleted … contact messages received before …`). Kopie, která přišla e-mailem do schránky fondu, tím nezmizí: zásady ochrany osobních údajů slibují, že ji fond drží jen do vyřízení dotazu, takže vyřízené zprávy z formuláře je potřeba ze schránky mazat ručně.

Každý den v 7:00 backend zkontroluje, zda už odešel měsíční přehled za minulý měsíc (registrovaní a noví dárci, přijaté dary za měsíc a od začátku roku, nespárované příchozí platby, poslední úspěšné stažení z Fio a poslední chyba), a pokud ne a nastal den odeslání, pošle ho. Komu chodí, v který den měsíce a které části obsahuje, nastaví správce ve webu na `/sprava/prehledy` (tabulka `donation_report_settings`); dokud nastavení neuložil, platí `REPORT_RECIPIENT` (bez řádku `CONTACT_RECIPIENT`), 1. den a všechny části. Normálně tedy odejde 1. dne v měsíci; byl-li backend ten den vypnutý, odejde při nejbližší ranní kontrole. Tamtéž správce pošle přehled za kterýkoli skončený měsíc znovu; když ho SMTP odmítne, stránka to řekne a v logu je `Monthly report for RRRR-MM sent by hand` jen po úspěchu. Odeslání se zapíše do tabulky `donation_monthly_report`, takže restart ani druhá instance ho nepošle podruhé; když ho SMTP odmítne, zápis se nezachová a backend to zkusí znovu další ráno (v logu `Monthly report for RRRR-MM could not be sent`). Přehled zároveň udržuje SMTP klíč v Brevo naživu: Brevo ruší klíč, přes který 90 dní nic neodešlo, a e-maily z formuláře nebo obnovy hesla by jinak mohly přestat odcházet bez povšimnutí.

Když stahování plateb z Fio selže třikrát za sebou (výpadek spojení, nesrozumitelná odpověď, neočekávaná chyba) nebo když Fio odmítne token, pošle backend na adresy z nastavení měsíčního přehledu (bez uloženého nastavení `REPORT_RECIPIENT`) jednu zprávu „Stahování plateb z banky selhává“ s důvodem a postupem; odmítnutí kvůli limitu 30 s a zamčená historie se nepočítají. Dokud porucha trvá, další zprávy nechodí (stav je v `bank_import_state.reported_outage`, restart ho nezmění); až se stažení povede, přijde „Stahování plateb z banky zase funguje“. Když SMTP samotnou zprávu odmítne, je v logu `The Fio import alert e-mail (...) could not be sent` a zpráva se neopakuje.

Když e-maily neodcházejí:
- `MailAuthenticationException` s `no password specified?` v `sudo docker logs nfnn-backend`: kontejner nemá `MAIL_USERNAME` nebo `MAIL_PASSWORD`. Ověř délky příkazem `printenv` výše a aplikaci přeinstaluj.
- V Brevo → Transactional → Logs stav Error s `sender … is not valid`: odesílatel není na doméně `nfnn.cz`. Server nainstalovaný před přechodem na `nfnn.cz` může mít v `backend.env` řádek `CONTACT_RECIPIENT` nebo `MAIL_FROM` se starou adresou; zakomentuj ho a aplikaci přeinstaluj.
- Úspěšné odeslání backend do logu nezapisuje; zda zpráva odešla, ukáže log v Brevo.

## Fio API

Backend si každou hodinu stahuje pohyby na účtu fondu přes Fio API (jen čtení) a páruje je s dárci. Bez tokenu je import vypnutý a zbytek aplikace běží normálně.

1. Ve Fio internetovém bankovnictví: Nastavení → API → vytvoř token typu „Sledování účtu“ pro účet fondu. Token začne fungovat asi 5 minut po vytvoření a platí 180 dní; hned si dej do kalendáře připomínku na jeho obnovu.
2. Token zapiš do `/DATA/AppData/nfnn/env/backend.env` na řádek `FIO_TOKEN=` (`sudo vi /DATA/AppData/nfnn/env/backend.env`) a aplikaci přeinstaluj. Token nikdy necommituj. Smí obsahovat jen písmena, číslice, `-` a `_`; s jiným znakem (uvozovka, mezera uvnitř) backend vůbec nenastartuje a v logu je `A Fio API token may contain only letters, digits, '-' and '_'` – oprav řádek a aplikaci přeinstaluj znovu.
3. První import sáhne 89 dní zpět. Má-li jít hlouběji: v `backend.env` odkomentuj řádek `FIO_HISTORY_FROM` a dej mu datum, třeba `FIO_HISTORY_FROM=2025-01-01` (tvar RRRR-MM-DD; s jiným, třeba `1.1.2025`, backend nenastartuje a log hlásí `FIO_HISTORY_FROM must be a date in the form YYYY-MM-DD`). ZimaOS hodnotu v nastavení aplikace ukáže jako `2025-01-01 00:00:00 +0000 UTC`; to je v pořádku, backend z ní vezme datum. Pak ve Fio odemkni historii (Nastavení → API, ikona zámku; odemčení platí 10 minut) a do 10 minut aplikaci přeinstaluj. Dokud se hlubší období nestáhne, backend se o něj pokusí při každém dalším startu; hodinové běhy chtějí jen posledních pár dní, takže odemčení potřebuje jen start.
4. V logu backendu (`sudo docker logs nfnn-backend`) zkontroluj asi 30 s po startu řádek `Fio import STARTUP ... completed`. `failed with HISTORY_LOCKED` znamená, že historie nebyla odemčená a import zatím pokryl jen 89 dní; `failed with UNAUTHORIZED` znamená, že token chybí, ještě neplatí nebo vypršel – vytvoř nový a nasaď ho stejně jako ten první. Vypršelý token nebo tři selhání za sebou ohlásí backend i e-mailem na `REPORT_RECIPIENT` (viz E-maily).
5. Stav importu je v tabulce `bank_import_state` (`covered_from`, `covered_to`, poslední chyba). `/actuator/health` na Fio nezávisí.

### Dárci registrovaní před nasazením importu

Párování používá vlastní kopii dárců v tabulce `donor_record`, kterou plní registrace. Dárci zaregistrovaní před nasazením verze s importem v ní nejsou a jejich platby by zůstaly nespárované. Po prvním nasazení s importem spusť jednou:

```bash
sudo docker exec -i nfnn-backup psql <<'SQL'
insert into donor_record (donor_id, type, name, company_identifier, street, city, postal_code, variable_symbol, preferred_locale, registered_at, updated_at)
select id, type, name, company_identifier, street, city, postal_code, variable_symbol, preferred_locale, registered_at, registered_at
from donor d
where not exists (select 1 from donor_record r where r.donor_id = d.id);
SQL
```

Kontejner `nfnn-backup` má přihlášení k databázi v prostředí, takže `psql` nepotřebuje žádné parametry. Příkaz je idempotentní; platby těchto dárců spáruje nejbližší hodinový import.

### Bankovní účty dárců a sběrné účty

Účet odesílatele se dárci přiřadí z platby s jeho VS; pak se mu přiřazují i platby bez VS z toho účtu. Dárce své účty vidí na nástěnce a u každého může párování vypnout a znovu zapnout (tlačítka „Vypnout párování“ a „Zapnout párování“, viz „Donor's bank accounts“ v `docs/api-contract.md`). Platí-li přes jeden účet víc lidí (platební brána, sbírkový nebo firemní účet zaměstnavatele), dej ho do `backend.env` na řádek `PAIRING_EXCLUDED_ACCOUNTS=` ve tvaru `číslo/kód banky`, víc účtů odděl čárkou, třeba `PAIRING_EXCLUDED_ACCOUNTS=2400000002/2010,19-2000145399/0800`, a aplikaci přeinstaluj. Z takového účtu se už žádnému dárci účet nepřiřadí a platby bez VS z něj zůstanou nespárované; platba s VS se spáruje dál podle VS. Účet, který se dárce naučil dřív, mu na nástěnce zůstane i s dosavadními dary, jen se mu z něj další platby bez VS ani platby se starším VS (níže) už nepřiřadí. Se špatně zapsaným účtem backend nenastartuje a log hlásí `app.donations.pairing.excluded-accounts holds a Czech account as number/bank code`.

Platba s VS, který žádný registrovaný dárce nemá (typicky starší VS v trvalém příkazu z doby před registrací), se podle účtu nepáruje. Když dárce ověří účet platbou 1 Kč se zprávou Ověření účtu a z účtu do dne ověření přišel právě jeden takový VS, nástěnka se ho u účtu zeptá, jestli jsou platby s tím VS jeho. Po „Ano, jsou moje“ se mu tyto platby přiřadí hned a další při každém importu, stejně jako platby bez VS; u sdíleného nebo vyloučeného účtu se nikdo neptá. Pravidla jsou v „Older variable symbol confirmation“ v `docs/api-contract.md`. Dárce svou odpověď sám nezmění; omyl opraví správce na stránce „Starší symboly“ (`/sprava/starsi-symboly`, viz „Starší variabilní symbol: oprava odpovědi“ níže).

**Před prvním nasazením verze s otázkou na starší VS.** Otázka platí hned po nasazení, bez přepínače, a dostanou ji i dárci, kteří účet ověřili dřív. Proto předtím:

1. Do `PAIRING_EXCLUDED_ACCOUNTS` přidej připisovací účty České pošty (platby poštovní poukázkou z nich chodí s VS mnoha různých lidí) a vlastní účty fondu.
2. Zkontroluj vazby na účty ze zkušebního provozu. Patří-li vazba testovacímu dárci a účet ve skutečnosti někomu jinému, je účet sdílený: platby bez VS z něj zůstávají nespárované a na starší VS se nikdo nezeptá. Vazby dárců na účty vidíš na kartě dárce ve správě (`/sprava/darci`, vyhledej dárce a otevři ho): tlačítko „Odebrat účet“ smaže vazbu i s dary, které přes ni přišly, a s odpověďmi dárce o starších symbolech u toho účtu; platby jsou pak zase nespárované. Odebrání se odmítne, dokud některý z těch darů kryje vydané potvrzení. „Vypnout párování“ nestačí: skutečný majitel by pak dostal platby z účtu, i ty se starším VS, až ode dne po vypnutí.
3. Aby pravidlo „právě jeden VS do dne ověření“ vidělo celou historii účtu, nastav před přeinstalací, která tuto verzi nasadí, v `backend.env` `FIO_HISTORY_FROM=2025-01-01`, odemkni historii ve Fio a do 10 minut aplikaci přeinstaluj (krok 3 v „Fio API“). Import při startu pak asi 30 s po startu stáhne platby od 1. 1. 2025. Dokud historie chybí, může nástěnka položit otázku, kterou by starší platby zablokovaly (třeba když z účtu dřív chodil i druhý VS).


### Starší variabilní symbol: oprava odpovědi

Odpovědi dárců na otázku u účtu vidí správce na stránce „Starší symboly“ (`/sprava/starsi-symboly`): kdo, z jakého účtu, na jaký VS, jak odpověděl („Ano, jsou moje“ nebo „Ne, nejsou moje“), kdy, a kolik darů se přes odpověď spárovalo. Nic z toho se nedělá na serveru (Jakub, 22. 10. 2026: žádná správa přes SQL); každý zásah je v historii správy.

**Omylem „Ano“**: tlačítko „Zrušit Ano“ smaže dary, které odpověď spárovala, a odpověď změní na „Ne“. Platby s tím VS pak zůstanou nespárované a dárce se na ně už nezeptá. Stránka odmítne odpověď zrušit, dokud na některý z jejích darů odkazuje vydané potvrzení: potvrzení za ten dar, nebo roční potvrzení za rok daru vystavené po jeho spárování, i když ho později nahradilo novější (vydané potvrzení zůstává vydané). Takovou odpověď nech, jak je, a řeš to s dárcem: web vydané potvrzení zrušit neumí. Zrušení bere stejný zámek jako párování, takže hodinový import ani odpověď dárce v tu chvíli nic nespárují, a zamkne řádek dárce, takže se mezitím nevystaví žádné jeho potvrzení. Roční potvrzení vystavené před spárováním darů tyto dary nepotvrzuje, takže zůstává, jak je.

**Omylem „Ne“**, nebo má-li dárce po zrušeném „Ano“ odpovědět znovu: tlačítko „Smazat Ne“ odpověď smaže a nástěnka se dárce zeptá znovu, pokud otázka pořád platí. Odpověď „Ano“ smazat nejde; tu nejdřív zruš.

**Jména z banky.** Osoby se nástěnka nezeptá, když banka u její ověřovací platby uvádí jméno s právní formou (`s.r.o.`, `a.s.`, `z.s.`, `o.p.s.`, `s.p.`, `p.o.`, `SVJ`, `společenství vlastníků`, `společnost`, `ústav`, `družstvo`, `nadace`, `obec`, `město`…), a firmy, když jméno právní formu nemá; platba bez jména se nekontroluje. Seznam forem je v `CounterpartyNames` v backendu. Před ostrým provozem projdi jména na skutečných ověřovacích platbách s typem dárce; stránka „Platby z banky“ u každé platby ukazuje jméno z banky a dárce, kterému patří. Objeví-li se forma, kterou seznam nezná (třeba vypsaná `příspěvková organizace` nebo `státní podnik`, nebo `farnost`), je potřeba ji do seznamu doplnit; do té doby se nástěnka může zeptat osoby i u účtu takové organizace, stejně jako když banka jméno zkrátí ještě před formou.

## Správci

Správce je obyčejný dárcovský účet s rolí `ADMIN`. Všechno kolem správců se dělá ve webu, ne na serveru (Jakub, 22. 10. 2026: žádná správa přes SQL): správa je na `/sprava`, odkaz „Správa“ se v hlavičce přehledu ukáže jen správci a backend pustí k `/api/admin/...` jen token s touto rolí. Správa dnes ukazuje stav stahování z banky, na stránce „Platby z banky“ (`/sprava/platby`) přiřazuje nespárované platby dárcům a ruší přiřazení a na stránce „Správci“ (`/sprava/spravci`) spravuje správce, na stránce „Starší symboly“ (`/sprava/starsi-symboly`) opravuje odpovědi dárců na starší variabilní symbol, na stránce „Dárci“ (`/sprava/darci`) najde dárce a na jeho kartě vidí účet, bankovní účty, dary a potvrzení, vypne mu dvoufaktorové ověření, spravuje jeho bankovní účty (vypnutí a zapnutí párování, odebrání omylem naučeného účtu i s dary přes něj) a na jeho žádost mu vymaže osobní údaje a na stránce „Historie správy“ (`/sprava/historie`) ukazuje, kdo co kdy udělal; každý zásah je v tabulce `admin_action`. Platba, které správce zrušil přiřazení, má `bank_payment.unpaired_by_admin_at` a automatické párování ji přeskakuje, dokud ji správce nepřiřadí znovu.

Správa je dostupná z internetu, proto roli `ADMIN` dostane jen přihlášení potvrzené dvoufaktorovým ověřením.

**První správce** (při instalaci, nebo kdyby správce nezbyl): do `backend.env` přidej řádek `ADMIN_EMAILS=jakub@example.cz` (víc adres oddělených čárkou) s e-mailem účtu, který už je zaregistrovaný, a nainstaluj znovu (změna env souboru, viz „Nasazení nové verze“). Backend při každém startu dá roli každému registrovanému účtu z řádku, kterému chybí; neregistrovanou adresu jen zapíše do logu jako varování a zkusí to při dalším startu. Řádek je jen pro start: správce, kterého někdo odebral ve webu, roli při dalším startu dostane zpět, dokud je v řádku, proto po prvním přihlášení řádek smaž nebo zakomentuj a další správce už přidávej ve webu.

**Další správce** přidá kterýkoli správce na stránce „Správci“: zadá e-mail, kterým je dárce registrovaný (účet musí existovat, jinak stránka řekne, že s tímto e-mailem není nikdo registrován). Pak:

1. Nový správce se přihlásí (zatím jako dárce) a na kartě „Přihlašovací údaje“ klikne na „Zapnout dvoufaktorové ověření“: zadá heslo, naskenuje QR kód (nebo opíše klíč) do ověřovací aplikace v telefonu (Google Authenticator, Microsoft Authenticator, Aegis apod.) a zadá první kód z ní. Tím je dvoufaktorové ověření zapnuté a správce hned vidí odkaz „Správa“.
2. Od té doby se přihlašuje heslem a kódem z aplikace. Dokud dvoufaktorové ověření nezapne, přihlásí se jen jako dárce a přehled mu napíše, že správa čeká na dvoufaktorové ověření; stránka „Správci“ u něj ukazuje „vypnuté, správa se mu ještě neotevře“.

**Odebrání správce**: na stránce „Správci“ tlačítko „Odebrat“ (sám sebe správce odebrat nemůže, aby web nezůstal bez správce). Odebranému skončí všechna přihlášení; roli ztratí nejpozději do 15 minut.

**Ztracený nebo vyměněný telefon**: jiný správce mu na stránce „Správci“ (nebo u kteréhokoli dárce na jeho kartě na stránce „Dárci“) klikne na „Vypnout dvoufaktorové ověření“. Nejdřív si telefonicky ověř, že žádá opravdu majitel účtu; stránka se na to před vypnutím ptá. Dotyčnému skončí všechna přihlášení a dostane e-mail, že mu správce dvoufaktorové ověření vypnul; přihlásí se pak jen heslem a zapne si ho znovu (záložní kódy neexistují). Správce bez dvoufaktorového ověření je do té doby jen dárce.

**Žádost o výmaz podle GDPR**: ověř si, že žádá opravdu majitel účtu (odpověz na jeho e-mail, případně zavolej), na stránce „Dárci“ ho najdi podle jména, e-mailu nebo variabilního symbolu a na jeho kartě klikni na „Vymazat osobní údaje“. Web nahradí jméno, adresu, e-mail a heslo zástupnými údaji, ukončí všechna jeho přihlášení, smaže jeho bankovní účty a odpovědi o starších symbolech a pošle mu na dosavadní e-mail potvrzení. Dary a vydaná potvrzení o daru zůstávají (jsou to účetní doklady), jen bez jména; nic se nemaže ze záloh, ty se otáčejí samy po 30 dnech. Výmaz je nevratný a zapíše se do historie správy. Správce vymazat nejde: nejdřív mu jiný správce odebere roli. Další platby s variabilním symbolem vymazaného dárce zůstanou nespárované (přiřadit je jde ručně na stránce „Platby z banky“); kdyby se dárce vrátil, zaregistruje se znovu a dostane nový symbol.

Kdo je správce vidíš na stránce „Správci“. Co kdo kdy udělal ukazuje stránka „Historie správy“ (`/sprava/historie`, tabulka `admin_action`): nejnovější nahoře, po 50 záznamech, u každého správce (i bývalého), čas, druh zásahu, čeho se týkal a technický popis.

## Potvrzení o daru

Přihlášený dárce si v portálu stáhne potvrzení o daru v PDF: za jeden dar kdykoli, za celý rok od 1. ledna následujícího roku, obojí jen za dary přijaté od 1. ledna 2026 (viz „Od kterého roku“ níže). Bez jakéhokoli nastavení potvrzení podepisuje Pavel Znamenáček, předseda správní rady, a místo obrázku podpisu je jen čára se jménem. Podepisujícího a sken podpisu určují tři řádky v `backend.env` (ve vzoru jsou zakomentované):

- `RECEIPT_SIGNATORY_NAME` – jméno podepisujícího (výchozí `Pavel Znamenáček`),
- `RECEIPT_SIGNATORY_ROLE` – jeho funkce (výchozí `předseda správní rady`),
- `RECEIPT_SIGNATURE_IMAGE` – cesta ke skenu podpisu uvnitř kontejneru backendu; bez ní je potvrzení bez obrázku podpisu.

Sken podpisu na serveru:

1. Naskenovaný podpis (PNG nebo JPEG; nejlépe PNG s průhledným pozadím) ulož na ZimaOS do složky `/DATA/AppData/nfnn/config`, kterou backend vidí jen pro čtení jako `/config`. Backend v kontejneru neběží jako root, proto soubor musí být čitelný pro všechny: `sudo install -m 644 signature.png /DATA/AppData/nfnn/config/signature.png`. Pro JPEG použij příponu `.jpg` a stejně uprav cestu níže; typ obrázku backend pozná podle přípony.
2. V `backend.env` odkomentuj řádek `RECEIPT_SIGNATURE_IMAGE=/config/signature.png`. Jiného podepisujícího nastav stejně řádky `RECEIPT_SIGNATORY_NAME=` a `RECEIPT_SIGNATORY_ROLE=`.
3. Aplikaci přeinstaluj (vlož znovu `deploy/compose.yml`).
4. Chybí-li soubor, nejde-li přečíst nebo nemá-li příponu `.png`, `.jpg` či `.jpeg`, backend nenastartuje a log (`sudo docker logs nfnn-backend`) hlásí `RECEIPT_SIGNATURE_IMAGE ...`. Prázdné jméno nebo funkce podepisujícího zastaví start s hlášením `RECEIPT_SIGNATORY_NAME ... is required` nebo `RECEIPT_SIGNATORY_ROLE ... is required`.

**Od kterého roku.** Web vystavuje potvrzení jen za dary přijaté od 1. ledna roku `RECEIPT_FIRST_YEAR`, bez řádku v `backend.env` od roku 2026: za dřívější dary mohl potvrzení vystavit fond sám a dárce nemá dostat dvě. Přehled dárce starší dary ukazuje dál, jen u nich nenabízí PDF, a o potvrzení za takový dar nebo za dřívější rok backend odpoví chybou „Za dary z této doby potvrzení na webu nevystavujeme“ (`donations/receipt-before-first-year`). Má-li web vystavovat i za rok 2025, odkomentuj v `backend.env` řádek `RECEIPT_FIRST_YEAR`, uprav ho na `RECEIPT_FIRST_YEAR=2025` a aplikaci přeinstaluj. Prázdná hodnota znamená 2026; celé číslo mimo 1000–9999 zastaví start s hlášením `RECEIPT_FIRST_YEAR (app.donations.receipt.first-year) must be a four-digit year, but is …` a text, který není celé číslo, nebo příliš velké číslo (třeba `99999999999`) s hlášením `Failed to bind properties under 'app.donations.receipt.first-year' to java.lang.Integer`. Potvrzení vystavené, dokud platil dřívější rok, v tabulce zůstane, ale po posunutí roku dopředu se už stáhnout nedá. Změna `RECEIPT_FIRST_YEAR` potřebuje i PR, který upraví větu „od 1. ledna 2026“ v zásadách ochrany osobních údajů (`@@content.privacy.donations.purpose` ve `frontend/src/app/features/content/privacy-policy/privacy-policy.html`), posune datum účinnosti zásad a upraví `privacy-policy.spec.ts`.

Vystavené potvrzení se neukládá jako PDF. Tabulka `donation_receipt` drží jen údaje, které na potvrzení stojí (zhruba 1 kB), a odkaz na šablonu, logo a podpis, se kterými vzniklo; šablona s texty je v tabulce `receipt_template` a obrázky v `receipt_image`, každá verze jen jednou. Každé stažení PDF vykreslí znovu a vyjde bajt po bajtu stejný soubor jako poprvé. Změna podepisujícího, podpisu nebo šablony proto platí jen pro nově vystavená potvrzení; už vystavená zůstávají se svou šablonou i svým podpisem, i když soubor se skenem na serveru vyměníš. Potvrzení uložená jako PDF ze zkušebního provozu aktualizace smaže; dárce při dalším stažení dostane nové potvrzení s novým číslem. Změní-li dárce jméno nebo adresu a potvrzení si stáhne znovu, vystaví se náhradní potvrzení s novým číslem a staré zůstává v tabulce jako nahrazené; náhrada přidá jen další řádek s údaji, takže tabulka i denní záloha rostou pomalu.

Najednou se vykreslují nejvýš tři potvrzení, další stažení chvíli počkají. Kdyby po Novém roce stahování vázlo a server měl volnou paměť i procesor, jde limit zvýšit řádkem `APP_DONATIONS_RECEIPT_CONCURRENTRENDERS=5` v `backend.env` a přeinstalací aplikace (vlastnost `app.donations.receipt.concurrent-renders`, výchozí `3`).

## Aktuality, projekty a fotky

Správce píše aktuality na `/sprava/aktuality` a projekty na `/sprava/projekty` a k nim nahrává fotky. Fotka smí být JPEG, PNG nebo WebP do 10 MB; backend ji otočí podle EXIF, zmenší na šířky 480, 960 a 1 440 px (nikdy nezvětšuje) a uloží jen tyto kopie ve WebP do tabulky `content_media_variant` (originál se nedrží). Fotky tedy leží v databázi: denní záloha (`pg_dump`) je obsahuje a na serveru není žádný další svazek. Jedna fotka zabere zhruba 150–400 kB, takže záloha roste pomalu; kdyby měla růst rychleji, ukazuje `select count(*), pg_size_pretty(sum(length(data))) from content_media_variant;` kolik fotky zabírají.

Limit 10 MB hlídá backend (`spring.servlet.multipart.max-file-size`, odpověď 413 „Soubor je příliš velký“) a nginx ve frontend kontejneru pouští na `/api/` 11 MB (`client_max_body_size` ve `frontend/nginx.conf`). Nginx Proxy Manager má výchozí limit 100 MB, nic se v něm nenastavuje; kdyby nahrání velké fotky vracelo 413 dřív, než se objeví hláška webu, je limit v NPM nebo v Cloudflare (ten dovoluje 100 MB).

Převod do WebP dělá knihovna `webp-imageio` s nativní libwebp pro Linux x64 i arm64; backend proto startuje s `--enable-native-access=ALL-UNNAMED` (v Dockerfile), jinak Java 25 jen vypíše varování do logu. Smazaná aktualita nebo projekt smaže i svou fotku; fotka nahraná a nikdy nepřipojená k aktualitě ani projektu v tabulce zůstane (zatím se neuklízí).

## Obnova hesla

Dárce, který zapomněl heslo, si v přihlašovacím okně (záložka „Obnovit heslo“) nechá poslat odkaz e-mailem, na stránce `/obnova-hesla` si nastaví nové heslo a přihlásí se jím. Odkaz platí hodinu a jde použít jen jednou; po změně hesla backend ukončí všechna přihlášení dárce (přístupový token, který už prohlížeč má, ještě nejvýš 15 minut platí). Odkazy jsou v tabulce `donor_password_reset_token`, která se uklízí sama.

- **Adresa v odkazu.** Odkaz v e-mailu se skládá z `PUBLIC_URL`, adresy, na které návštěvníci web otevírají. Bez ní platí `https://nfnn.znamenacek.duckdns.org`. Při přechodu na skutečnou doménu odkomentuj v `backend.env` řádek `PUBLIC_URL` a dej mu novou adresu (`PUBLIC_URL=https://<doména>`), pak aplikaci přeinstaluj. Prázdná hodnota, adresa bez `http://` či `https://` nebo adresa s `?` či `#` zastaví start backendu s hlášením `PUBLIC_URL (app.site.public-url) ...` v logu.
- **Bez SMTP e-maily neodcházejí.** Dokud v `backend.env` nejsou vyplněné `MAIL_HOST`, `MAIL_USERNAME` a `MAIL_PASSWORD` (a případně `MAIL_FROM`), kontaktní formulář i obnova hesla odpovídají, jako by zprávu odeslaly, ale žádný e-mail neodejde. U obnovy hesla je jediným příznakem řádek `Password reset e-mail for donor … could not be sent: …` v `sudo docker logs nfnn-backend`, zakončený jen třídou výjimky: s `backend.env` podle vzoru (`MAIL_AUTH=true` bez přihlašovacích údajů) je to `MailAuthenticationException`, u nedostupného serveru `MailSendException`; z bezpečnostních důvodů v něm není adresa ani podrobnosti chyby. SMTP proto zkoušej kontaktním formulářem, jehož chyba v logu obsahuje celou odpověď serveru.
- **Odesílatel.** Všechny e-maily (kontaktní formulář, obnova hesla i měsíční přehled) odcházejí z adresy `MAIL_FROM`; bez ní z `CONTACT_RECIPIENT`. E-mail s odkazem má jako jméno odesílatele „Nová naděje – nadační fond“. Řádek `MAIL_FROM=` s prázdnou hodnotou zastaví start s hlášením `MAIL_FROM (app.mail.sender-email) is required`; buď ho vyplň, nebo nech zakomentovaný. Před ostrým provozem potřebuje doména odesílatele SPF, DKIM a DMARC, jinak odkazy skončí ve spamu.
- **Omezení.** Z jedné adresy návštěvníka jde poslat nejvýš 5 žádostí za hodinu (šestá dostane odpověď 429) a jeden dárce má nejvýš 3 platné odkazy najednou; další žádost do hodiny nic nepošle. Kdo zná adresu dárce, může jeho tři odkazy na hodinu obsadit; kdyby se to dělo, řešením je CAPTCHA.
- **Adresa návštěvníka.** Limit na adresu počítá s tím, že Nginx Proxy Manager posílá hlavičku `X-Forwarded-For` (dělá to sám od sebe) a nginx ve frontend image z ní vezme adresu návštěvníka a hlavičky poslané klientem zahodí. Po přechodu na Cloudflare musí NPM brát adresu návštěvníka z `CF-Connecting-IP` (v Advanced konfiguraci proxy hostu `real_ip_header CF-Connecting-IP;` a `set_real_ip_from` pro rozsahy adres Cloudflare), jinak limit počítá adresy Cloudflare a jedna jeho adresa může zablokovat obnovu hesla, přihlášení i registraci mnoha návštěvníkům naráz. Klient z privátní adresy, který se k frontend nginx dostane přímo a ne přes NPM – v lokálním `docker-compose.yml` i na serveru z domácí sítě přes port 8089 – si svou adresu pro limit může vymyslet; z internetu to nejde, a doma to nevadí.

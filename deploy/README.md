# Nasazení na ZimaOS

Image se staví na GitHubu, ZimaOS je stáhne a spustí jako aplikaci „Nová naděje“. Zatím ručně, automatický deploy přijde později.

```
PR ─► PR check (GitHub runner): testy backendu a frontendu, build image, start celého stacku
merge do main ─► Publish Docker images: ghcr.io/bzumik1/nfnn-backend a -frontend (veřejné),
                 tagy latest a krátký SHA commitu
ZimaOS ─► aplikace „Nová naděje“ z compose.yml (App Store → Custom Install)
```

`compose.yml` je produkční stack pro ZimaOS: Postgres, denní zálohy, backend a frontend na portu 8089 (8080 je na Zimě obsazený). Kořenový `docker-compose.yml` je jen pro lokální vývoj.

## Hesla a nastavení serveru

Hesla, tokeny a nastavení, která patří jen tomuto serveru, nejsou v `compose.yml`, ale ve dvou souborech na disku ZimaOS. `compose.yml` se proto do ZimaOS vkládá vždy beze změn.

| Soubor | Obsah | Čte ho |
|---|---|---|
| `/DATA/AppData/nfnn/env/db.env` | heslo databáze, stejné na třech řádcích `POSTGRES_PASSWORD`, `PGPASSWORD` a `DB_PASSWORD` | Postgres, zálohy, backend |
| `/DATA/AppData/nfnn/env/backend.env` | `JWT_SECRET`, `FIO_TOKEN`, SMTP (`MAIL_*`) a volitelná nastavení backendu | jen backend |

Vzory jsou v repu jako `deploy/db.env.example` a `deploy/backend.env.example`; co který řádek znamená, říká komentář nad ním. Vyplněné soubory do repa nepatří, `.gitignore` všechny `*.env` ignoruje. Postgres a zálohy `backend.env` nedostanou, takže token Fio, heslo SMTP ani JWT klíč v databázových kontejnerech nejsou.

- Hodnoty piš bez uvozovek. Nesmí obsahovat `$` (docker compose ho bere jako začátek proměnné a hodnota se zkomolí) ani mezeru před `#` (od ní dál je komentář). Hesla z `openssl rand -hex 32` mají jen číslice a písmena a–f.
- Volitelný řádek buď vyplň, nebo nech zakomentovaný (`#` na začátku). Prázdná hodnota není totéž co chybějící řádek: prázdné `MAIL_FROM`, `CONTACT_RECIPIENT`, `REPORT_RECIPIENT`, `PUBLIC_URL`, `RECEIPT_SIGNATORY_NAME` nebo `RECEIPT_SIGNATORY_ROLE` zastaví start backendu (prázdné `CONTACT_RECIPIENT` bez `MAIL_FROM` hlásí chybu `MAIL_FROM (app.mail.sender-email) is required`).
- **Po každé změně souboru aplikaci přeinstaluj** (vlož znovu `deploy/compose.yml`). ZimaOS si při instalaci zkopíruje hodnoty ze souborů do své kopie compose jako `environment:` a ty mají přednost. Restart ani `docker compose up --force-recreate` proto nové hodnoty nenačtou, kontejner dostane ty z poslední instalace. Co kontejner opravdu vidí, ukáže bez prozrazení hodnot `sudo docker exec nfnn-backend printenv | awk -F= '/^MAIL_/{print $1, length($0)-length($1)-1}'` (délka 0 = prázdné).
- ZimaOS při tom kopírování čte hodnoty jako YAML, takže datum převede na čas: z `FIO_HISTORY_FROM=2025-01-01` udělá `2025-01-01 00:00:00 +0000 UTC` a tak ho ukáže i v nastavení aplikace. Backend tenhle tvar přijme (do opravy v říjnu 2026 na něm nenastartoval s chybou `Text '2025-01-01 00:00:00 +0000 UTC' could not be parsed`). Ostatní řádky vzoru nic takového nepotkává: port, rok a `true` zůstanou, jak jsou, a e-maily, adresy, cesty, tokeny ani čísla účtů YAML za datum ani číslo nepovažuje.
- Soubory musí existovat před instalací. Chybí-li některý, instalace skončí chybou, která jmenuje chybějící soubor (`/DATA/AppData/nfnn/env/db.env` nebo `backend.env`) a hlásí `no such file or directory` nebo `not found`.
- Kdyby ZimaOS compose s `env_file` odmítla, vrať se k dřívějšímu postupu s hesly přímo v compose: starý `deploy/compose.yml` i tento návod k němu jsou v historii gitu (`git log -p -- deploy/compose.yml deploy/README.md`).

## Instalace

1. Na Macu v kořeni repa zkopíruj vzory na ZimaOS (`<uživatel>` je tvůj uživatel na ní):

   ```bash
   scp deploy/db.env.example deploy/backend.env.example <uživatel>@192.168.1.117:/tmp/
   ```

2. Přes SSH na ZimaOS z nich založ soubory, které smí číst jen root, a složku pro sken podpisu:

   ```bash
   sudo install -d -m 700 /DATA/AppData/nfnn/env
   sudo install -d -m 755 /DATA/AppData/nfnn/config
   sudo install -m 600 /tmp/db.env.example /DATA/AppData/nfnn/env/db.env
   sudo install -m 600 /tmp/backend.env.example /DATA/AppData/nfnn/env/backend.env
   rm /tmp/db.env.example /tmp/backend.env.example
   ```

3. Heslo databáze a JWT klíč vygeneruj rovnou do souborů. Heslo se zapíše na všechny tři řádky `db.env` a ani jedna hodnota se neukáže na obrazovce ani nezůstane v historii shellu:

   ```bash
   sudo sh -c 'p=$(openssl rand -hex 32) && sed -i -E "s/^(POSTGRES_PASSWORD|PGPASSWORD|DB_PASSWORD)=.*/\1=$p/" /DATA/AppData/nfnn/env/db.env'
   sudo sh -c 'j=$(openssl rand -hex 32) && sed -i -E "s/^JWT_SECRET=.*/JWT_SECRET=$j/" /DATA/AppData/nfnn/env/backend.env'
   ```

   Nemá-li ZimaOS `openssl`, napiš v obou příkazech místo `openssl rand -hex 32` tohle: `head -c 32 /dev/urandom | od -An -tx1 | tr -d " \n"`.

4. Token Fio a SMTP doplň do `backend.env`, máš-li je (`sudo vi /DATA/AppData/nfnn/env/backend.env`; viz [Fio API](#fio-api) a [Obnova hesla](#obnova-hesla)). Prázdné nech, dokud je nemáš: bez tokenu je import plateb vypnutý a bez SMTP e-maily neodcházejí. Které řádky mají hodnotu, ukáže (hodnoty samotné nevypíše):

   ```bash
   sudo grep -E '^[A-Z_]+=' /DATA/AppData/nfnn/env/db.env /DATA/AppData/nfnn/env/backend.env | sed -E 's/=.+/=(vyplněno)/'
   ```

   `POSTGRES_PASSWORD`, `PGPASSWORD`, `DB_PASSWORD` a `JWT_SECRET` musí být `(vyplněno)`.

5. ZimaOS → App Store → Custom Install → smazat vzor, vložit `deploy/compose.yml` beze změn → Install.
6. Heslo databáze po první instalaci neměň: Postgres si ho zapíše do dat v `/DATA/AppData/nfnn/postgres` a nové heslo by backend nepustilo dovnitř. Nový JWT klíč jen odhlásí všechny dárce.

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

Po merge do `main` počkej, až v Actions doběhne zeleně **Publish Docker images**. Pak v ZimaOS otevři nastavení aplikace „Nová naděje“ a klikni na **Uložit** bez jakékoli změny: ZimaOS stáhne nové image `latest` a kontejnery vytvoří znovu; data i env soubory v `/DATA/AppData/nfnn` zůstanou. Tlačítko Update to neudělá (u tagu `latest` aplikaci považuje za aktuální) a samotné `docker restart` taky ne, kontejner by běžel dál ze staré image.

Kterou verzi kontejnery mají, ukáže commit, ze kterého image vznikla; má se shodovat s commitem běhu **Publish Docker images**:

```bash
sudo docker inspect nfnn-backend nfnn-frontend --format '{{.Name}} {{index .Config.Labels "org.opencontainers.image.revision"}}'
```

Uložení bere compose z poslední instalace, takže změnu `compose.yml` nebo env souborů nepřenese; na ty je dál potřeba přeinstalace.

## Zálohy

Kontejner `backup` udělá `pg_dump` při každém startu a pak každých 24 hodin do `/DATA/AppData/nfnn/backups/nfnn-<datum>.dump` a maže zálohy starší než 30 dní. Leží na stejném disku jako databáze, takže je potřeba je kopírovat i mimo Zimu (ZimaOS Backup, cloud sync). Složky `env/` a `config/` záloha nekopíruje; jejich obsah (hesla, tokeny, podpis) si ulož do správce hesel.

Zálohu na požádání, třeba před aktualizací, udělá:

```bash
sudo docker exec nfnn-backup sh -c 'pg_dump --format=custom --file="/backups/nfnn-`date +%Y-%m-%d_%H%M`-rucni.dump"'
```

### Obnova

Záloha se obnovuje do prázdného schématu. `pg_restore --clean` nestačí: smaže jen to, co v záloze je, takže tabulky z novější verze zůstanou, zatímco tabulka Liquibase se vrátí do stavu zálohy, a backend pak při startu spadne na pokusu založit tabulku, která už existuje.

1. Zastav backend a pro jistotu ulož současný stav:

   ```bash
   sudo docker stop nfnn-backend
   sudo docker exec nfnn-backup sh -c 'pg_dump --format=custom --file="/backups/nfnn-`date +%Y-%m-%d_%H%M`-pred-obnovou.dump"'
   ```

2. Vyprázdni schéma a nahraj zálohu (název souboru podle `sudo ls /DATA/AppData/nfnn/backups`):

   ```bash
   sudo docker exec nfnn-backup psql -v ON_ERROR_STOP=1 -c 'DROP SCHEMA public CASCADE' -c 'CREATE SCHEMA public'
   sudo docker exec nfnn-backup pg_restore --exit-on-error --single-transaction --dbname=novanadeje /backups/nfnn-2026-10-17_0300.dump
   ```

   Když `pg_restore` skončí chybou, schéma zůstane prázdné; zopakuj tento krok se zálohou `-pred-obnovou`.

3. Spusť backend: `sudo docker start nfnn-backend`. Liquibase doplní změny databáze, které jsou v běžící verzi novější než záloha.

### Návrat na předchozí verzi

Každá image má vedle `latest` i tag se zkráceným commitem (7 znaků, např. `418105c`), seznam je v GitHubu u balíčků `nfnn-backend` a `nfnn-frontend`. V nastavení aplikace „Nová naděje“ v ZimaOS změň u backendu a frontendu tag z `latest` na commit předchozí verze a klikni na **Uložit**. Zpátky na nejnovější verzi se vrátíš tagem `latest`.

Pokud novější verze měnila databázi (v jejím commitu přibyl soubor v `backend/src/main/resources/db/changelog/`), starší backend s novější databází fungovat nemusí. Pak po změně tagu obnov zálohu z doby před aktualizací (viz Obnova); dary a registrace mezi zálohou a obnovou se ztratí, platby z banky z posledních 90 dní se ale při dalším stažení z Fio doplní znovu. Proto před aktualizací, která mění databázi, udělej zálohu na požádání.

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

Každý den v 7:00 backend zkontroluje, zda už odešel měsíční přehled za minulý měsíc (registrovaní a noví dárci, přijaté dary za měsíc a od začátku roku, nespárované příchozí platby, poslední úspěšné stažení z Fio a poslední chyba), a pokud ne, pošle ho na `REPORT_RECIPIENT` (bez řádku na `CONTACT_RECIPIENT`). Normálně tedy odejde 1. dne v měsíci; byl-li backend ten den vypnutý, odejde při nejbližší ranní kontrole. Odeslání se zapíše do tabulky `donation_monthly_report`, takže restart ani druhá instance ho nepošle podruhé; když ho SMTP odmítne, zápis se nezachová a backend to zkusí znovu další ráno (v logu `Monthly report for RRRR-MM could not be sent`). Přehled zároveň udržuje SMTP klíč v Brevo naživu: Brevo ruší klíč, přes který 90 dní nic neodešlo, a e-maily z formuláře nebo obnovy hesla by jinak mohly přestat odcházet bez povšimnutí.

Když stahování plateb z Fio selže třikrát za sebou (výpadek spojení, nesrozumitelná odpověď, neočekávaná chyba) nebo když Fio odmítne token, pošle backend na `REPORT_RECIPIENT` jednu zprávu „Stahování plateb z banky selhává“ s důvodem a postupem; odmítnutí kvůli limitu 30 s a zamčená historie se nepočítají. Dokud porucha trvá, další zprávy nechodí (stav je v `bank_import_state.reported_outage`, restart ho nezmění); až se stažení povede, přijde „Stahování plateb z banky zase funguje“. Když SMTP samotnou zprávu odmítne, je v logu `The Fio import alert e-mail (...) could not be sent` a zpráva se neopakuje.

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

Platba s VS, který žádný registrovaný dárce nemá (typicky starší VS v trvalém příkazu z doby před registrací), se podle účtu nepáruje. Když dárce ověří účet platbou 1 Kč se zprávou Ověření účtu a z účtu do dne ověření přišel právě jeden takový VS, nástěnka se ho u účtu zeptá, jestli jsou platby s tím VS jeho. Po „Ano, jsou moje“ se mu tyto platby přiřadí hned a další při každém importu, stejně jako platby bez VS; u sdíleného nebo vyloučeného účtu se nikdo neptá. Pravidla jsou v „Older variable symbol confirmation“ v `docs/api-contract.md`. Dárce svou odpověď sám nezmění; výpis odpovědí a opravu omylu popisuje „Starší variabilní symbol: výpis a oprava vazeb“ níže.

**Před prvním nasazením verze s otázkou na starší VS.** Otázka platí hned po nasazení, bez přepínače, a dostanou ji i dárci, kteří účet ověřili dřív. Proto předtím:

1. Do `PAIRING_EXCLUDED_ACCOUNTS` přidej připisovací účty České pošty (platby poštovní poukázkou z nich chodí s VS mnoha různých lidí) a vlastní účty fondu.
2. Zkontroluj vazby na účty ze zkušebního provozu (vypíše je příkaz níže). Patří-li vazba testovacímu dárci a účet ve skutečnosti někomu jinému, je účet sdílený: platby bez VS z něj zůstávají nespárované a na starší VS se nikdo nezeptá. Takovou vazbu odstraň v databázi i s dary, které přes ni přišly (hotový příkaz na to tu zatím není). „Vypnout párování“ nestačí: skutečný majitel by pak dostal platby z účtu, i ty se starším VS, až ode dne po vypnutí.
3. Aby pravidlo „právě jeden VS do dne ověření“ vidělo celou historii účtu, nastav před přeinstalací, která tuto verzi nasadí, v `backend.env` `FIO_HISTORY_FROM=2025-01-01`, odemkni historii ve Fio a do 10 minut aplikaci přeinstaluj (krok 3 v „Fio API“). Import při startu pak asi 30 s po startu stáhne platby od 1. 1. 2025. Dokud historie chybí, může nástěnka položit otázku, kterou by starší platby zablokovaly (třeba když z účtu dřív chodil i druhý VS).

Vazby dárců na účty vypíše:

<!-- sender-account-links:start -->
```bash
sudo docker exec -i nfnn-backup psql -v ON_ERROR_STOP=1 <<'SQL'
select r.name as darce, s.account_number || '/' || s.bank_code as ucet, s.status as stav, s.valid_from as od_dne, s.valid_to as do_dne,
       s.learned_at as prokazano
from donor_sender_account s join donor_record r on r.donor_id = s.donor_id
order by ucet, s.created_at;
SQL
```
<!-- sender-account-links:end -->

### Starší variabilní symbol: výpis a oprava vazeb

Odpovědi dárců na otázku u účtu jsou v tabulce `donor_symbol_claim` (`CONFIRMED` je „Ano, jsou moje“, `DECLINED` je „Ne, nejsou moje“). Dary spárované přes potvrzený VS mají v tabulce `donation` hodnotu `paired_by = 'CONFIRMED_SYMBOL'` a v `symbol_claim_id` id vazby. Každý příkaz níže pouští `psql` s `ON_ERROR_STOP=1`, takže se na první chybě zastaví.

Výpis odpovědí, nejnovější nahoře (`vazba` je id, které potřebují další příkazy, `daru` počet darů, které vazba spárovala):

<!-- symbol-claim-list:start -->
```bash
sudo docker exec -i nfnn-backup psql -v ON_ERROR_STOP=1 <<'SQL'
select c.id as vazba, r.name as darce, c.account_number || '/' || c.bank_code as ucet, c.variable_symbol as vs,
       c.answer as odpoved, c.answered_at as kdy,
       (select count(*) from donation d where d.symbol_claim_id = c.id) as daru
from donor_symbol_claim c join donor_record r on r.donor_id = c.donor_id
order by c.answered_at desc;
SQL
```
<!-- symbol-claim-list:end -->

**Omylem „Ano“.** Příkaz smaže dary, které vazba spárovala, a odpověď změní na „Ne“. Platby s tím VS pak zůstanou nespárované a dárce se na ně už nezeptá. Příkaz odmítne vazbu zrušit, dokud na některý z jejích darů odkazuje vydané potvrzení: potvrzení za ten dar, nebo roční potvrzení za rok daru vystavené po jeho spárování, i když ho později nahradilo novější (vydané potvrzení zůstává vydané). Takovou vazbu nech, jak je, a řeš to s dárcem: web vydané potvrzení zrušit neumí. `ID_VAZBY` nahraď id z výpisu:

<!-- symbol-claim-reverse:start -->
```bash
sudo docker exec -i nfnn-backup psql -v ON_ERROR_STOP=1 -v claim=ID_VAZBY <<'SQL'
begin;
select pg_advisory_xact_lock(20261022);
create temp table target_claim on commit drop as
  select id, donor_id from donor_symbol_claim where id = :'claim' and answer = 'CONFIRMED';
select 1 from donor_record r join target_claim c on c.donor_id = r.donor_id for update of r;
create temp table target_donations on commit drop as
  select d.id, d.donor_id, d.received_on, d.recorded_at from donation d join target_claim c on d.symbol_claim_id = c.id;
do $$
begin
  if not exists (select 1 from target_claim) then
    raise exception 'Potvrzená vazba s tímto id neexistuje';
  end if;
  if exists (select 1 from donation_receipt r join target_donations d on r.donation_id = d.id)
     or exists (select 1 from donation_receipt r join target_donations d on r.donor_id = d.donor_id
                where r.kind = 'YEARLY' and r.receipt_year = extract(year from d.received_on) and r.issued_at >= d.recorded_at) then
    raise exception 'Na dary z této vazby odkazuje vydané potvrzení o daru, vazbu nejde zrušit';
  end if;
end $$;
delete from donation where id in (select id from target_donations);
update donor_symbol_claim set answer = 'DECLINED', answered_at = now() where id in (select id from target_claim);
commit;
SQL
```
<!-- symbol-claim-reverse:end -->

Povede-li se to, výpis končí `DELETE` s počtem smazaných darů, `UPDATE 1` a `COMMIT`. Po chybě se nezmění nic: `Potvrzená vazba s tímto id neexistuje` znamená špatné id nebo vazbu s odpovědí „Ne“, `Na dary z této vazby odkazuje vydané potvrzení o daru` vydané potvrzení. Příkaz nejdřív vezme stejný zámek jako párování (`pg_advisory_xact_lock(20261022)`, v backendu `PostgresPairingLock.KEY`), takže hodinový import ani odpověď dárce v tu chvíli nic nespárují, a pak zamkne řádek dárce v `donor_record`, takže se do konce příkazu nevystaví žádné jeho potvrzení. Roční potvrzení vystavené před spárováním darů tyto dary nepotvrzuje, takže zůstává, jak je.

**Omylem „Ne“**, nebo má-li dárce po zrušeném „Ano“ odpovědět znovu: příkaz smaže odpověď „Ne“ a nástěnka se dárce zeptá znovu, pokud otázka pořád platí. Odpověď „Ano“ nesmaže (výpis hlásí `DELETE 0`); tu nejdřív zruš příkazem výše.

<!-- symbol-claim-reset:start -->
```bash
sudo docker exec -i nfnn-backup psql -v ON_ERROR_STOP=1 -v claim=ID_VAZBY <<'SQL'
delete from donor_symbol_claim c where c.id = :'claim' and c.answer = 'DECLINED'
  and not exists (select 1 from donation d where d.symbol_claim_id = c.id);
SQL
```
<!-- symbol-claim-reset:end -->

**Jména z banky.** Osoby se nástěnka nezeptá, když banka u její ověřovací platby uvádí jméno s právní formou (`s.r.o.`, `a.s.`, `z.s.`, `o.p.s.`, `s.p.`, `p.o.`, `SVJ`, `společenství vlastníků`, `společnost`, `ústav`, `družstvo`, `nadace`, `obec`, `město`…), a firmy, když jméno právní formu nemá; platba bez jména se nekontroluje. Seznam forem je v `CounterpartyNames` v backendu. Před ostrým provozem projdi jména na skutečných ověřovacích platbách s typem dárce (`PERSON` osoba, `COMPANY` firma). Objeví-li se forma, kterou seznam nezná (třeba vypsaná `příspěvková organizace` nebo `státní podnik`, nebo `farnost`), je potřeba ji do seznamu doplnit; do té doby se nástěnka může zeptat osoby i u účtu takové organizace, stejně jako když banka jméno zkrátí ještě před formou.

<!-- symbol-claim-names:start -->
```bash
sudo docker exec -i nfnn-backup psql -v ON_ERROR_STOP=1 <<'SQL'
select distinct r.type as typ, p.counterparty_name as jmeno_v_bance
from donation d join bank_payment p on p.id = d.bank_payment_id join donor_record r on r.donor_id = d.donor_id
where d.purpose = 'ACCOUNT_VERIFICATION'
order by 1, 2;
SQL
```
<!-- symbol-claim-names:end -->

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

## Obnova hesla

Dárce, který zapomněl heslo, si v přihlašovacím okně (záložka „Obnovit heslo“) nechá poslat odkaz e-mailem, na stránce `/obnova-hesla` si nastaví nové heslo a přihlásí se jím. Odkaz platí hodinu a jde použít jen jednou; po změně hesla backend ukončí všechna přihlášení dárce (přístupový token, který už prohlížeč má, ještě nejvýš 15 minut platí). Odkazy jsou v tabulce `donor_password_reset_token`, která se uklízí sama.

- **Adresa v odkazu.** Odkaz v e-mailu se skládá z `PUBLIC_URL`, adresy, na které návštěvníci web otevírají. Bez ní platí `https://nfnn.znamenacek.duckdns.org`. Při přechodu na skutečnou doménu odkomentuj v `backend.env` řádek `PUBLIC_URL` a dej mu novou adresu (`PUBLIC_URL=https://<doména>`), pak aplikaci přeinstaluj. Prázdná hodnota, adresa bez `http://` či `https://` nebo adresa s `?` či `#` zastaví start backendu s hlášením `PUBLIC_URL (app.site.public-url) ...` v logu.
- **Bez SMTP e-maily neodcházejí.** Dokud v `backend.env` nejsou vyplněné `MAIL_HOST`, `MAIL_USERNAME` a `MAIL_PASSWORD` (a případně `MAIL_FROM`), kontaktní formulář i obnova hesla odpovídají, jako by zprávu odeslaly, ale žádný e-mail neodejde. U obnovy hesla je jediným příznakem řádek `Password reset e-mail for donor … could not be sent: …` v `sudo docker logs nfnn-backend`, zakončený jen třídou výjimky: s `backend.env` podle vzoru (`MAIL_AUTH=true` bez přihlašovacích údajů) je to `MailAuthenticationException`, u nedostupného serveru `MailSendException`; z bezpečnostních důvodů v něm není adresa ani podrobnosti chyby. SMTP proto zkoušej kontaktním formulářem, jehož chyba v logu obsahuje celou odpověď serveru.
- **Odesílatel.** Všechny e-maily (kontaktní formulář, obnova hesla i měsíční přehled) odcházejí z adresy `MAIL_FROM`; bez ní z `CONTACT_RECIPIENT`. E-mail s odkazem má jako jméno odesílatele „Nová naděje – nadační fond“. Řádek `MAIL_FROM=` s prázdnou hodnotou zastaví start s hlášením `MAIL_FROM (app.mail.sender-email) is required`; buď ho vyplň, nebo nech zakomentovaný. Před ostrým provozem potřebuje doména odesílatele SPF, DKIM a DMARC, jinak odkazy skončí ve spamu.
- **Omezení.** Z jedné adresy návštěvníka jde poslat nejvýš 5 žádostí za hodinu (šestá dostane odpověď 429) a jeden dárce má nejvýš 3 platné odkazy najednou; další žádost do hodiny nic nepošle. Kdo zná adresu dárce, může jeho tři odkazy na hodinu obsadit; kdyby se to dělo, řešením je CAPTCHA.
- **Adresa návštěvníka.** Limit na adresu počítá s tím, že Nginx Proxy Manager posílá hlavičku `X-Forwarded-For` (dělá to sám od sebe) a nginx ve frontend image z ní vezme adresu návštěvníka a hlavičky poslané klientem zahodí. Po přechodu na Cloudflare musí NPM brát adresu návštěvníka z `CF-Connecting-IP` (v Advanced konfiguraci proxy hostu `real_ip_header CF-Connecting-IP;` a `set_real_ip_from` pro rozsahy adres Cloudflare), jinak limit počítá adresy Cloudflare a jedna jeho adresa může zablokovat obnovu hesla, přihlášení i registraci mnoha návštěvníkům naráz. Klient z privátní adresy, který se k frontend nginx dostane přímo a ne přes NPM – v lokálním `docker-compose.yml` i na serveru z domácí sítě přes port 8089 – si svou adresu pro limit může vymyslet; z internetu to nejde, a doma to nevadí.

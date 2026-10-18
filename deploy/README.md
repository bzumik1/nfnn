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
- Volitelný řádek buď vyplň, nebo nech zakomentovaný (`#` na začátku). Prázdná hodnota není totéž co chybějící řádek: prázdné `MAIL_FROM`, `CONTACT_RECIPIENT`, `PUBLIC_URL`, `RECEIPT_SIGNATORY_NAME` nebo `RECEIPT_SIGNATORY_ROLE` zastaví start backendu (prázdné `CONTACT_RECIPIENT` bez `MAIL_FROM` hlásí chybu `MAIL_FROM (app.mail.sender-email) is required`).
- **Po každé změně souboru aplikaci přeinstaluj** (vlož znovu `deploy/compose.yml`). ZimaOS si při instalaci zkopíruje hodnoty ze souborů do své kopie compose jako `environment:` a ty mají přednost. Restart ani `docker compose up --force-recreate` proto nové hodnoty nenačtou, kontejner dostane ty z poslední instalace. Co kontejner opravdu vidí, ukáže bez prozrazení hodnot `sudo docker exec nfnn-backend printenv | awk -F= '/^MAIL_/{print $1, length($0)-length($1)-1}'` (délka 0 = prázdné).
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

Po merge do `main` počkej, až v Actions doběhne zeleně **Publish Docker images**. Pak v ZimaOS aplikaci přeinstaluj se stejným compose, vloženým beze změn; data i env soubory v `/DATA/AppData/nfnn` zůstanou. Samotné `docker restart` nestačí, kontejner by běžel dál ze staré image.

## Zálohy

Kontejner `backup` udělá `pg_dump` při každém startu a pak každých 24 hodin do `/DATA/AppData/nfnn/backups/nfnn-<datum>.dump` a maže zálohy starší než 30 dní. Leží na stejném disku jako databáze, takže je potřeba je kopírovat i mimo Zimu (ZimaOS Backup, cloud sync).

Obnova:

```bash
sudo docker stop nfnn-backend
sudo docker exec nfnn-backup sh -c 'pg_restore --clean --if-exists --dbname="$PGDATABASE" /backups/nfnn-2026-10-17_0300.dump'
sudo docker start nfnn-backend
```

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

Když e-maily neodcházejí:
- `MailAuthenticationException` s `no password specified?` v `sudo docker logs nfnn-backend`: kontejner nemá `MAIL_USERNAME` nebo `MAIL_PASSWORD`. Ověř délky příkazem `printenv` výše a aplikaci přeinstaluj.
- V Brevo → Transactional → Logs stav Error s `sender … is not valid`: odesílatel není na doméně `nfnn.cz`. Server nainstalovaný před přechodem na `nfnn.cz` může mít v `backend.env` řádek `CONTACT_RECIPIENT` nebo `MAIL_FROM` se starou adresou; zakomentuj ho a aplikaci přeinstaluj.
- Úspěšné odeslání backend do logu nezapisuje; zda zpráva odešla, ukáže log v Brevo.

## Fio API

Backend si každou hodinu stahuje pohyby na účtu fondu přes Fio API (jen čtení) a páruje je s dárci. Bez tokenu je import vypnutý a zbytek aplikace běží normálně.

1. Ve Fio internetovém bankovnictví: Nastavení → API → vytvoř token typu „Sledování účtu“ pro účet fondu. Token začne fungovat asi 5 minut po vytvoření a platí 180 dní; hned si dej do kalendáře připomínku na jeho obnovu.
2. Token zapiš do `/DATA/AppData/nfnn/env/backend.env` na řádek `FIO_TOKEN=` (`sudo vi /DATA/AppData/nfnn/env/backend.env`) a aplikaci přeinstaluj. Token nikdy necommituj. Smí obsahovat jen písmena, číslice, `-` a `_`; s jiným znakem (uvozovka, mezera uvnitř) backend vůbec nenastartuje a v logu je `A Fio API token may contain only letters, digits, '-' and '_'` – oprav řádek a aplikaci přeinstaluj znovu.
3. První import sáhne 89 dní zpět. Má-li jít hlouběji: v `backend.env` odkomentuj řádek `FIO_HISTORY_FROM` a dej mu datum, třeba `FIO_HISTORY_FROM=2025-01-01` (tvar RRRR-MM-DD; s jiným, třeba `1.1.2025`, backend nenastartuje a log hlásí `FIO_HISTORY_FROM must be a date in the form YYYY-MM-DD`). Pak ve Fio odemkni historii (Nastavení → API, ikona zámku; odemčení platí 10 minut) a do 10 minut aplikaci přeinstaluj. Dokud se hlubší období nestáhne, backend se o něj pokusí při každém dalším startu; hodinové běhy chtějí jen posledních pár dní, takže odemčení potřebuje jen start.
4. V logu backendu (`sudo docker logs nfnn-backend`) zkontroluj asi 30 s po startu řádek `Fio import STARTUP ... completed`. `failed with HISTORY_LOCKED` znamená, že historie nebyla odemčená a import zatím pokryl jen 89 dní; `failed with UNAUTHORIZED` znamená, že token chybí, ještě neplatí nebo vypršel – vytvoř nový a nasaď ho stejně jako ten první.
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

Účet odesílatele se dárci přiřadí z platby s jeho VS; pak se mu přiřazují i platby bez VS z toho účtu. Dárce své účty vidí na nástěnce, může je odpojit a znovu připojit (viz „Donor's bank accounts“ v `docs/api-contract.md`). Platí-li přes jeden účet víc lidí (platební brána, sbírkový nebo firemní účet zaměstnavatele), dej ho do `backend.env` na řádek `PAIRING_EXCLUDED_ACCOUNTS=` ve tvaru `číslo/kód banky`, víc účtů odděl čárkou, třeba `PAIRING_EXCLUDED_ACCOUNTS=2400000002/2010,19-2000145399/0800`, a aplikaci přeinstaluj. Z takového účtu se už žádnému dárci účet nepřiřadí a platby bez VS z něj zůstanou nespárované; platba s VS se spáruje dál podle VS. Účet, který se dárce naučil dřív, mu na nástěnce zůstane i s dosavadními dary, jen se mu z něj další platby bez VS už nepřiřadí. Se špatně zapsaným účtem backend nenastartuje a log hlásí `app.donations.pairing.excluded-accounts holds a Czech account as number/bank code`.

## Potvrzení o daru

Přihlášený dárce si v portálu stáhne potvrzení o daru v PDF: za jeden dar kdykoli, za celý rok od 1. ledna následujícího roku. Bez jakéhokoli nastavení potvrzení podepisuje Pavel Znamenáček, předseda správní rady, a místo obrázku podpisu je jen čára se jménem. Podepisujícího a sken podpisu určují tři řádky v `backend.env` (ve vzoru jsou zakomentované):

- `RECEIPT_SIGNATORY_NAME` – jméno podepisujícího (výchozí `Pavel Znamenáček`),
- `RECEIPT_SIGNATORY_ROLE` – jeho funkce (výchozí `předseda správní rady`),
- `RECEIPT_SIGNATURE_IMAGE` – cesta ke skenu podpisu uvnitř kontejneru backendu; bez ní je potvrzení bez obrázku podpisu.

Sken podpisu na serveru:

1. Naskenovaný podpis (PNG nebo JPEG; nejlépe PNG s průhledným pozadím) ulož na ZimaOS do složky `/DATA/AppData/nfnn/config`, kterou backend vidí jen pro čtení jako `/config`. Backend v kontejneru neběží jako root, proto soubor musí být čitelný pro všechny: `sudo install -m 644 signature.png /DATA/AppData/nfnn/config/signature.png`. Pro JPEG použij příponu `.jpg` a stejně uprav cestu níže; typ obrázku backend pozná podle přípony.
2. V `backend.env` odkomentuj řádek `RECEIPT_SIGNATURE_IMAGE=/config/signature.png`. Jiného podepisujícího nastav stejně řádky `RECEIPT_SIGNATORY_NAME=` a `RECEIPT_SIGNATORY_ROLE=`.
3. Aplikaci přeinstaluj (vlož znovu `deploy/compose.yml`).
4. Chybí-li soubor, nejde-li přečíst nebo nemá-li příponu `.png`, `.jpg` či `.jpeg`, backend nenastartuje a log (`sudo docker logs nfnn-backend`) hlásí `RECEIPT_SIGNATURE_IMAGE ...`. Prázdné jméno nebo funkce podepisujícího zastaví start s hlášením `RECEIPT_SIGNATORY_NAME ... is required` nebo `RECEIPT_SIGNATORY_ROLE ... is required`.

Vystavené potvrzení se neukládá jako PDF. Tabulka `donation_receipt` drží jen údaje, které na potvrzení stojí (zhruba 1 kB), a odkaz na šablonu, logo a podpis, se kterými vzniklo; šablona s texty je v tabulce `receipt_template` a obrázky v `receipt_image`, každá verze jen jednou. Každé stažení PDF vykreslí znovu a vyjde bajt po bajtu stejný soubor jako poprvé. Změna podepisujícího, podpisu nebo šablony proto platí jen pro nově vystavená potvrzení; už vystavená zůstávají se svou šablonou i svým podpisem, i když soubor se skenem na serveru vyměníš. Potvrzení vystavená před touto změnou mají PDF uložené dál a stahují se z něj. Změní-li dárce jméno nebo adresu a potvrzení si stáhne znovu, vystaví se náhradní potvrzení s novým číslem a staré zůstává v tabulce jako nahrazené; náhrada přidá jen další řádek s údaji, takže tabulka i denní záloha rostou pomalu.

Najednou se vykreslují nejvýš tři potvrzení, další stažení chvíli počkají. Kdyby po Novém roce stahování vázlo a server měl volnou paměť i procesor, jde limit zvýšit řádkem `APP_DONATIONS_RECEIPT_CONCURRENTRENDERS=5` v `backend.env` a přeinstalací aplikace (vlastnost `app.donations.receipt.concurrent-renders`, výchozí `3`).

## Obnova hesla

Dárce, který zapomněl heslo, si v přihlašovacím okně (záložka „Obnovit heslo“) nechá poslat odkaz e-mailem, na stránce `/obnova-hesla` si nastaví nové heslo a přihlásí se jím. Odkaz platí hodinu a jde použít jen jednou; po změně hesla backend ukončí všechna přihlášení dárce (přístupový token, který už prohlížeč má, ještě nejvýš 15 minut platí). Odkazy jsou v tabulce `donor_password_reset_token`, která se uklízí sama.

- **Adresa v odkazu.** Odkaz v e-mailu se skládá z `PUBLIC_URL`, adresy, na které návštěvníci web otevírají. Bez ní platí `https://nfnn.znamenacek.duckdns.org`. Při přechodu na skutečnou doménu odkomentuj v `backend.env` řádek `PUBLIC_URL` a dej mu novou adresu (`PUBLIC_URL=https://<doména>`), pak aplikaci přeinstaluj. Prázdná hodnota, adresa bez `http://` či `https://` nebo adresa s `?` či `#` zastaví start backendu s hlášením `PUBLIC_URL (app.site.public-url) ...` v logu.
- **Bez SMTP e-maily neodcházejí.** Dokud v `backend.env` nejsou vyplněné `MAIL_HOST`, `MAIL_USERNAME` a `MAIL_PASSWORD` (a případně `MAIL_FROM`), kontaktní formulář i obnova hesla odpovídají, jako by zprávu odeslaly, ale žádný e-mail neodejde. U obnovy hesla je jediným příznakem řádek `Password reset e-mail for donor … could not be sent: …` v `sudo docker logs nfnn-backend`, zakončený jen třídou výjimky: s `backend.env` podle vzoru (`MAIL_AUTH=true` bez přihlašovacích údajů) je to `MailAuthenticationException`, u nedostupného serveru `MailSendException`; z bezpečnostních důvodů v něm není adresa ani podrobnosti chyby. SMTP proto zkoušej kontaktním formulářem, jehož chyba v logu obsahuje celou odpověď serveru.
- **Odesílatel.** Všechny e-maily (kontaktní formulář i obnova hesla) odcházejí z adresy `MAIL_FROM`; bez ní z `CONTACT_RECIPIENT`. E-mail s odkazem má jako jméno odesílatele „Nová naděje – nadační fond“. Řádek `MAIL_FROM=` s prázdnou hodnotou zastaví start s hlášením `MAIL_FROM (app.mail.sender-email) is required`; buď ho vyplň, nebo nech zakomentovaný. Před ostrým provozem potřebuje doména odesílatele SPF, DKIM a DMARC, jinak odkazy skončí ve spamu.
- **Omezení.** Z jedné adresy návštěvníka jde poslat nejvýš 5 žádostí za hodinu (šestá dostane odpověď 429) a jeden dárce má nejvýš 3 platné odkazy najednou; další žádost do hodiny nic nepošle. Kdo zná adresu dárce, může jeho tři odkazy na hodinu obsadit; kdyby se to dělo, řešením je CAPTCHA.
- **Adresa návštěvníka.** Limit na adresu počítá s tím, že Nginx Proxy Manager posílá hlavičku `X-Forwarded-For` (dělá to sám od sebe) a nginx ve frontend image z ní vezme adresu návštěvníka a hlavičky poslané klientem zahodí. Po přechodu na Cloudflare musí NPM brát adresu návštěvníka z `CF-Connecting-IP` (v Advanced konfiguraci proxy hostu `real_ip_header CF-Connecting-IP;` a `set_real_ip_from` pro rozsahy adres Cloudflare), jinak limit počítá adresy Cloudflare a jedna jeho adresa může zablokovat obnovu hesla mnoha návštěvníkům naráz. Klient z privátní adresy, který se k frontend nginx dostane přímo a ne přes NPM – v lokálním `docker-compose.yml` i na serveru z domácí sítě přes port 8089 – si svou adresu pro limit může vymyslet; z internetu to nejde, a doma to nevadí.

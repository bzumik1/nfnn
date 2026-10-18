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
- Volitelný řádek buď vyplň, nebo nech zakomentovaný (`#` na začátku). Prázdná hodnota není totéž co chybějící řádek: prázdné `MAIL_FROM`, `PUBLIC_URL`, `RECEIPT_SIGNATORY_NAME` nebo `RECEIPT_SIGNATORY_ROLE` zastaví start backendu.
- **Po každé změně souboru aplikaci přeinstaluj** (vlož znovu `deploy/compose.yml`). ZimaOS si hodnoty nejspíš při instalaci zkopíruje do své kopie compose, takže samotný restart může nechat staré hodnoty.
- Soubory musí existovat před instalací. Chybí-li některý, instalace skončí chybou `env file /DATA/AppData/nfnn/env/... not found`.
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

Když se změní `compose.yml` v repu, aplikaci přeinstaluj s novým souborem; soubory v `/DATA/AppData/nfnn/env` zůstanou, jak jsou.

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
4. Připojoval-li starý compose sken podpisu z `/DATA/AppData/nfnn/receipt/signature.png`, přesuň ho: `sudo mv /DATA/AppData/nfnn/receipt/signature.png /DATA/AppData/nfnn/config/`. Nový compose připojuje celou složku `config` jako `/config`, takže řádek `RECEIPT_SIGNATURE_IMAGE=/config/signature.png` platí dál.
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

Stejně jako `nakocarky.cz`: doménu na Cloudflare (proxied, SSL Full strict), CNAME na `kocarky.znamenacek.duckdns.org`, v NPM nový proxy host na stejný port 8089 a `www` přesměrovat na holou doménu. Před ostrým provozem je potřeba SMTP služba (`MAIL_*` v `backend.env`), SPF/DKIM/DMARC na doméně a `PUBLIC_URL` v `backend.env` s novou doménou (viz Obnova hesla), jinak odkazy v e-mailech vedou na starou adresu.

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

Vystavené potvrzení je uložené v tabulce `donation_receipt` a každé další stažení vrátí stejný soubor. Změna podepisujícího nebo podpisu proto platí jen pro nově vystavená potvrzení; už vystavená se nemění. Změní-li dárce jméno nebo adresu a potvrzení si stáhne znovu, vystaví se náhradní potvrzení s novým číslem a staré zůstává v tabulce jako nahrazené; každá taková náhrada přidá jedno PDF (desítky kB) a počet náhrad nic neomezuje, takže tabulka i denní záloha s nimi rostou.

## Obnova hesla

Dárce, který zapomněl heslo, si v přihlašovacím okně (záložka „Obnovit heslo“) nechá poslat odkaz e-mailem, na stránce `/obnova-hesla` si nastaví nové heslo a přihlásí se jím. Odkaz platí hodinu a jde použít jen jednou; po změně hesla backend ukončí všechna přihlášení dárce (přístupový token, který už prohlížeč má, ještě nejvýš 15 minut platí). Odkazy jsou v tabulce `donor_password_reset_token`, která se uklízí sama.

- **Adresa v odkazu.** Odkaz v e-mailu se skládá z `PUBLIC_URL`, adresy, na které návštěvníci web otevírají. Bez ní platí `https://nfnn.znamenacek.duckdns.org`. Při přechodu na skutečnou doménu odkomentuj v `backend.env` řádek `PUBLIC_URL` a dej mu novou adresu (`PUBLIC_URL=https://<doména>`), pak aplikaci přeinstaluj. Prázdná hodnota, adresa bez `http://` či `https://` nebo adresa s `?` či `#` zastaví start backendu s hlášením `PUBLIC_URL (app.site.public-url) ...` v logu.
- **Bez SMTP e-maily neodcházejí.** Dokud v `backend.env` nejsou vyplněné `MAIL_HOST`, `MAIL_USERNAME` a `MAIL_PASSWORD` (a případně `MAIL_FROM`), kontaktní formulář i obnova hesla odpovídají, jako by zprávu odeslaly, ale žádný e-mail neodejde. U obnovy hesla je jediným příznakem řádek `Password reset e-mail for donor … could not be sent: …` v `sudo docker logs nfnn-backend`, zakončený jen třídou výjimky: s `backend.env` podle vzoru (`MAIL_AUTH=true` bez přihlašovacích údajů) je to `MailAuthenticationException`, u nedostupného serveru `MailSendException`; z bezpečnostních důvodů v něm není adresa ani podrobnosti chyby. SMTP proto zkoušej kontaktním formulářem, jehož chyba v logu obsahuje celou odpověď serveru.
- **Odesílatel.** Všechny e-maily (kontaktní formulář i obnova hesla) odcházejí z adresy `MAIL_FROM`; bez ní z `CONTACT_RECIPIENT`. E-mail s odkazem má jako jméno odesílatele „Nová naděje – nadační fond“. Řádek `MAIL_FROM=` s prázdnou hodnotou zastaví start s hlášením `MAIL_FROM (app.mail.sender-email) is required`; buď ho vyplň, nebo nech zakomentovaný. Před ostrým provozem potřebuje doména odesílatele SPF, DKIM a DMARC, jinak odkazy skončí ve spamu.
- **Omezení.** Z jedné adresy návštěvníka jde poslat nejvýš 5 žádostí za hodinu (šestá dostane odpověď 429) a jeden dárce má nejvýš 3 platné odkazy najednou; další žádost do hodiny nic nepošle. Kdo zná adresu dárce, může jeho tři odkazy na hodinu obsadit; kdyby se to dělo, řešením je CAPTCHA.
- **Adresa návštěvníka.** Limit na adresu počítá s tím, že Nginx Proxy Manager posílá hlavičku `X-Forwarded-For` (dělá to sám od sebe) a nginx ve frontend image z ní vezme adresu návštěvníka a hlavičky poslané klientem zahodí. Po přechodu na Cloudflare musí NPM brát adresu návštěvníka z `CF-Connecting-IP` (v Advanced konfiguraci proxy hostu `real_ip_header CF-Connecting-IP;` a `set_real_ip_from` pro rozsahy adres Cloudflare), jinak limit počítá adresy Cloudflare a jedna jeho adresa může zablokovat obnovu hesla mnoha návštěvníkům naráz. Klient z privátní adresy, který se k frontend nginx dostane přímo a ne přes NPM – v lokálním `docker-compose.yml` i na serveru z domácí sítě přes port 8089 – si svou adresu pro limit může vymyslet; z internetu to nejde, a doma to nevadí.

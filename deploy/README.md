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

Stejně jako `nakocarky.cz`: doménu na Cloudflare (proxied, SSL Full strict), CNAME na `kocarky.znamenacek.duckdns.org`, v NPM nový proxy host na stejný port 8089 a `www` přesměrovat na holou doménu. Před ostrým provozem je potřeba SMTP služba (`MAIL_*` u backendu), SPF/DKIM/DMARC na doméně a `PUBLIC_URL` backendu s novou doménou (viz Obnova hesla), jinak odkazy v e-mailech vedou na starou adresu.

## Fio API

Backend si každou hodinu stahuje pohyby na účtu fondu přes Fio API (jen čtení) a páruje je s dárci. Bez tokenu je import vypnutý a zbytek aplikace běží normálně.

1. Ve Fio internetovém bankovnictví: Nastavení → API → vytvoř token typu „Sledování účtu“ pro účet fondu. Token začne fungovat asi 5 minut po vytvoření a platí 180 dní; hned si dej do kalendáře připomínku na jeho obnovu.
2. Do `compose.yml`, který vkládáš do ZimaOS, přidej pod `environment:` backendu řádek `FIO_TOKEN: <token>` – hodnotu přímo, bez `$` a bez kotvy. Soubor v repu tento řádek nemá, takže ho přidej při každém dalším vložení compose do ZimaOS; token nikdy necommituj. Token smí obsahovat jen písmena, číslice, `-` a `_`; s jiným znakem (uvozovka, mezera uvnitř) backend vůbec nenastartuje a v logu je `A Fio API token may contain only letters, digits, '-' and '_'` – vlož token znovu.
3. První import sáhne 89 dní zpět. Má-li jít hlouběji: ve Fio odemkni historii (Nastavení → API, ikona zámku; odemčení platí 10 minut), přidej backendu řádek `FIO_HISTORY_FROM: 2025-01-01` (datum RRRR-MM-DD, zase bez `$`; s jiným tvarem, třeba `1.1.2025`, backend nenastartuje a log hlásí `FIO_HISTORY_FROM must be a date in the form YYYY-MM-DD`) a do 10 minut backend restartuj (přeinstaluj aplikaci). Dokud se hlubší období nestáhne, backend se o něj pokusí při každém dalším startu; hodinové běhy chtějí jen posledních pár dní, takže odemčení potřebuje jen start.
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

Přihlášený dárce si v portálu stáhne potvrzení o daru v PDF: za jeden dar kdykoli, za celý rok od 1. ledna následujícího roku. Bez jakéhokoli nastavení potvrzení podepisuje Pavel Znamenáček, předseda správní rady, a místo obrázku podpisu je jen čára se jménem. Podepisujícího a sken podpisu určují tři proměnné backendu:

- `RECEIPT_SIGNATORY_NAME` – jméno podepisujícího (výchozí `Pavel Znamenáček`),
- `RECEIPT_SIGNATORY_ROLE` – jeho funkce (výchozí `předseda správní rady`),
- `RECEIPT_SIGNATURE_IMAGE` – cesta ke skenu podpisu uvnitř kontejneru backendu; bez ní je potvrzení bez obrázku podpisu.

Sken podpisu na serveru:

1. Naskenovaný podpis (PNG nebo JPEG; nejlépe PNG s průhledným pozadím) ulož na ZimaOS jako `/DATA/AppData/nfnn/receipt/signature.png`. Pro JPEG použij příponu `.jpg` a stejně uprav obě cesty níže; typ obrázku backend pozná podle přípony.
2. Do `compose.yml`, který vkládáš do ZimaOS, přidej backendu připojení souboru jen pro čtení a pod `environment:` cestu k němu (hodnoty přímo, bez `$`):

   ```yaml
       volumes:
         - /DATA/AppData/nfnn/receipt/signature.png:/config/signature.png:ro
       environment:
         RECEIPT_SIGNATURE_IMAGE: /config/signature.png
   ```

   Jiného podepisujícího nastav stejně řádky `RECEIPT_SIGNATORY_NAME: ...` a `RECEIPT_SIGNATORY_ROLE: ...`.
3. Soubor `deploy/compose.yml` v repu tyto řádky nemá. Na server se dostanou, až compose znovu vložíš do ZimaOS (přeinstaluj aplikaci), a přidat je musíš při každém dalším vložení.
4. Chybí-li soubor, nejde-li přečíst nebo nemá-li příponu `.png`, `.jpg` či `.jpeg`, backend nenastartuje a log (`sudo docker logs nfnn-backend`) hlásí `RECEIPT_SIGNATURE_IMAGE ...`. Prázdné jméno nebo funkce podepisujícího zastaví start s hlášením `RECEIPT_SIGNATORY_NAME ... is required` nebo `RECEIPT_SIGNATORY_ROLE ... is required`.

Vystavené potvrzení je uložené v tabulce `donation_receipt` a každé další stažení vrátí stejný soubor. Změna podepisujícího nebo podpisu proto platí jen pro nově vystavená potvrzení; už vystavená se nemění. Změní-li dárce jméno nebo adresu a potvrzení si stáhne znovu, vystaví se náhradní potvrzení s novým číslem a staré zůstává v tabulce jako nahrazené; každá taková náhrada přidá jedno PDF (desítky kB) a počet náhrad nic neomezuje, takže tabulka i denní záloha s nimi rostou.

## Obnova hesla

Dárce, který zapomněl heslo, si v přihlašovacím okně (záložka „Obnovit heslo“) nechá poslat odkaz e-mailem, na stránce `/obnova-hesla` si nastaví nové heslo a přihlásí se jím. Odkaz platí hodinu a jde použít jen jednou; po změně hesla backend ukončí všechna přihlášení dárce (přístupový token, který už prohlížeč má, ještě nejvýš 15 minut platí). Odkazy jsou v tabulce `donor_password_reset_token`, která se uklízí sama.

- **Adresa v odkazu.** Odkaz v e-mailu se skládá z `PUBLIC_URL`, adresy, na které návštěvníci web otevírají. Bez ní platí `https://nfnn.znamenacek.duckdns.org`. Při přechodu na skutečnou doménu přidej do `compose.yml`, který vkládáš do ZimaOS, pod `environment:` backendu řádek `PUBLIC_URL: https://<doména>` – hodnotu přímo, bez `$`, stejně jako `FIO_TOKEN`. Soubor `deploy/compose.yml` v repu tento řádek nemá; na server se dostane, až compose znovu vložíš do ZimaOS (přeinstaluj aplikaci), a přidat ho musíš při každém dalším vložení. Prázdná hodnota, adresa bez `http://` či `https://` nebo adresa s `?` či `#` zastaví start backendu s hlášením `PUBLIC_URL (app.site.public-url) ...` v logu.
- **Bez SMTP e-maily neodcházejí.** Dokud v compose nejsou vyplněné `MAIL_HOST`, `MAIL_USERNAME` a `MAIL_PASSWORD` (a případně `MAIL_FROM`), kontaktní formulář i obnova hesla odpovídají, jako by zprávu odeslaly, ale žádný e-mail neodejde. U obnovy hesla je jediným příznakem řádek `Password reset e-mail for donor … could not be sent: …` v `sudo docker logs nfnn-backend`, zakončený jen třídou výjimky: s vloženým compose (`MAIL_AUTH: "true"` bez přihlašovacích údajů) je to `MailAuthenticationException`, u nedostupného serveru `MailSendException`; z bezpečnostních důvodů v něm není adresa ani podrobnosti chyby. SMTP proto zkoušej kontaktním formulářem, jehož chyba v logu obsahuje celou odpověď serveru.
- **Odesílatel.** Všechny e-maily (kontaktní formulář i obnova hesla) odcházejí z adresy `MAIL_FROM`; bez ní z `CONTACT_RECIPIENT`. E-mail s odkazem má jako jméno odesílatele „Nová naděje – nadační fond“. Řádek `MAIL_FROM: ""` s prázdnou hodnotou zastaví start s hlášením `MAIL_FROM (app.mail.sender-email) is required`; buď ho vyplň, nebo vynech celý. Před ostrým provozem potřebuje doména odesílatele SPF, DKIM a DMARC, jinak odkazy skončí ve spamu.
- **Omezení.** Z jedné adresy návštěvníka jde poslat nejvýš 5 žádostí za hodinu (šestá dostane odpověď 429) a jeden dárce má nejvýš 3 platné odkazy najednou; další žádost do hodiny nic nepošle. Kdo zná adresu dárce, může jeho tři odkazy na hodinu obsadit; kdyby se to dělo, řešením je CAPTCHA.
- **Adresa návštěvníka.** Limit na adresu počítá s tím, že Nginx Proxy Manager posílá hlavičku `X-Forwarded-For` (dělá to sám od sebe) a nginx ve frontend image z ní vezme adresu návštěvníka a hlavičky poslané klientem zahodí. Po přechodu na Cloudflare musí NPM brát adresu návštěvníka z `CF-Connecting-IP` (v Advanced konfiguraci proxy hostu `real_ip_header CF-Connecting-IP;` a `set_real_ip_from` pro rozsahy adres Cloudflare), jinak limit počítá adresy Cloudflare a jedna jeho adresa může zablokovat obnovu hesla mnoha návštěvníkům naráz. V lokálním `docker-compose.yml` si klient z privátní adresy může svou adresu pro limit vymyslet; lokálně to nevadí.

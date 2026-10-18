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

Vystavené potvrzení je uložené v tabulce `donation_receipt` a každé další stažení vrátí stejný soubor. Změna podepisujícího nebo podpisu proto platí jen pro nově vystavená potvrzení; už vystavená se nemění.

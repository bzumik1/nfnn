# Nasazení na ZimaOS

Image se staví na GitHubu, ZimaOS je stáhne a spustí jako aplikaci „Nová naděje“. Nasazuje se ručně (Jakub, 17. 10. 2026: runner na serveru s přístupem k Dockeru nechceme).

```
PR ─► PR check (GitHub runner): testy backendu a frontendu, build image, start celého stacku
merge do main ─► Publish Docker images: ghcr.io/bzumik1/nfnn-backend, -frontend, -backup, -postgres a -mcp (veřejné),
                 tagy latest a krátký SHA commitu
ZimaOS ─► aplikace „Nová naděje“ z compose.yml (App Store → Custom Install)
```

`compose.yml` je produkční stack pro ZimaOS: Postgres (obraz `nfnn-postgres`, který si sám vygeneruje heslo), zálohy, backend, frontend na portu 8089 (8080 je na Zimě obsazený) a MCP konektor (viz [MCP konektor](#mcp-konektor)). Kořenový `docker-compose.yml` je jen pro lokální vývoj.

## Hesla a nastavení serveru

Na serveru se nic nepíše do souborů. `compose.yml` se do ZimaOS vkládá vždy beze změn a nemá v sobě žádné heslo ani hodnotu jen pro tento server.

- **Hesla a klíče si aplikace vygeneruje sama** do `/DATA/AppData/nfnn/secrets/` (jen root, práva 600): `db-password` vytvoří kontejner databáze (obraz `nfnn-postgres`), `jwt-secret` (podpis přihlášení) a `settings-key` (šifruje tajné hodnoty v databázi) backend. Nikdo je nezadává ani nevidí. Doporučení: `settings-key` si ulož do správce hesel (`sudo cat /DATA/AppData/nfnn/secrets/settings-key`); bez něj obnova databáze na jiném serveru nepřečte uložené tajné hodnoty a správa je ukáže jako „zadejte znovu“.
- **Nastavení webu** (adresa webu, SMTP Brevo, odesílatel a příjemce e-mailů, token Fio, e-mail prvního správce) se zadává v prohlížeči: při první instalaci průvodcem na `/prvni-nastaveni`, potom ve správě webu na `/sprava/nastaveni`. Ukládá se do databáze (tabulka `operations_setting`), heslo SMTP a token Fio zašifrované klíčem ze `secrets/settings-key`. Uložení backend restartuje, web pak asi minutu neodpovídá.
- Ztratí-li se složka `secrets/` (nový server), heslo databáze i klíče se vygenerují znovu: všichni se jen znovu přihlásí a tajné hodnoty v nastavení je potřeba zadat znovu ve správě.
- Sken podpisu na potvrzení se nahrává ve správě na `/sprava/nastaveni` (viz [Potvrzení o daru](#potvrzení-o-daru)).

## Instalace

1. Stěhuješ-li web z jiného serveru nebo ho obnovuješ po havárii, měj po ruce soubor zálohy `.dump` (stažený ze stránky Zálohy, nebo kopii složky `backups/` starého serveru): v kroku 3 ho průvodce nahraje sám (viz [Obnova](#obnova)).
2. ZimaOS → App Store → Custom Install → smazat vzor, vložit `deploy/compose.yml` beze změn → Install. Složky v `/DATA/AppData/nfnn/` vytvoří Docker sám.
3. Klikni v ZimaOS na ikonu aplikace. Web se otevře na adrese Zimy s portem 8089 a protože jde přímo z domácí sítě, ukáže rovnou průvodce prvním nastavením. Otevřeš-li web odjinud (přes doménu, NPM nebo Cloudflare), průvodce chce kód z logu: ZimaOS → aplikace → Terminál a logy → `nfnn-backend`, rámeček „První nastavení webu“ s kódem typu `K7QM-2XPA-9TRD` (mění se s každým startem; do `logs/backend.log` ani do správy se nedostane).
4. V průvodci vyplň:
   - **Adresa webu**: adresa, na které ho uvidí návštěvníci (`https://nfnn.cz`, dokud DNS nepřepneš `https://nfnn.znamenacek.duckdns.org`).
   - **E-maily**: server `smtp-relay.brevo.com`, port 587, přihlašovací jméno účtu fondu a SMTP klíč z Brevo ([E-maily](#e-maily)); tlačítkem „Ověřit spojení“ se průvodce k serveru zkusí přihlásit bez odeslání e-mailu.
   - **Token Fio** (nepovinný, [Fio API](#fio-api)) a **e-mail prvního správce**.
5. „Uložit a spustit“: backend hodnoty nejdřív ověří stejně jako při startu (chybnou vrátí do formuláře, takže server nikdy neuvízne ve smyčce restartů), uloží je a restartuje se. Průvodce počká a nabídne registraci.
6. Zaregistruj se s e-mailem správce a potvrď ho odkazem z e-mailu: roli správce dostaneš hned po potvrzení. Pak si v portálu dárce v části „Údaje a zabezpečení“ (`/darce/udaje`) zapni dvoufaktorové ověření a správa (`/sprava`) se otevře. Další správce přidáš ve správě.

Kontejnery NFNN mají vlastní sítě, ne výchozí síť Dockeru, kterou sdílejí ostatní aplikace na Zimě: `nfnn-edge` (web, backend, konektor) a `nfnn-internal` bez cesty ven (databáze, zálohy, backend). Jiná aplikace na serveru se tak k backendu ani k databázi nedostane, jen k webu přes port 8089 jako kdokoli jiný. Ověření po instalaci:

```bash
sudo docker inspect nfnn-postgres nfnn-backup nfnn-backend nfnn-mcp nfnn-frontend --format '{{.Name}} {{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}'
```

Má vypsat `nfnn-internal` u databáze a záloh, obě sítě u backendu a `nfnn-edge` u konektoru a webu; `bridge` u žádného.

Do dokončení průvodce by ho mohl vyplnit kdokoli z domácí sítě; po dokončení odpovídá 409 a nastavení mění jen správce se druhým faktorem. Změní-li se `compose.yml` v repu, aplikaci přeinstaluj s novým souborem; nastavení v databázi i složka `secrets/` zůstanou.

## Přechod z env souborů

Server nainstalovaný před průvodcem má hesla a nastavení v `/DATA/AppData/nfnn/env/` (`db.env`, `backend.env`, případně `ops.env`). Jednorázový přechod:

1. Opiš si hodnoty, které budeš zadávat v průvodci: ZimaOS → Soubory → `/DATA/AppData/nfnn/env/`, nebo `sudo cat /DATA/AppData/nfnn/env/backend.env`. Potřeba jsou `PUBLIC_URL`, `MAIL_USERNAME`, `MAIL_PASSWORD`, `FIO_TOKEN` a e-mail z `ADMIN_EMAILS`; ostatní mají v průvodci správné výchozí hodnoty. Pokročilé hodnoty (`FIO_HISTORY_FROM`, `PAIRING_EXCLUDED_ACCOUNTS`, `RECEIPT_*`) se po průvodci nastaví ve správě na `/sprava/nastaveni`.
2. Aplikaci odinstaluj (data v `/DATA/AppData/nfnn` zůstanou) a nainstaluj s novým `deploy/compose.yml`, vloženým beze změn.
3. Heslo databáze se převezme samo: kontejner `nfnn-postgres` při startu nastaví roli v databázi na nově vygenerované heslo ze `secrets/` (přes lokální socket, staré heslo nepotřebuje). V logu `nfnn-postgres` je řádek `the database role uses the password from /secrets/db-password`. Nový `jwt-secret` jen odhlásí všechny přihlášené.
4. Otevři web ikonou v ZimaOS a vyplň průvodce (Instalace, kroky 3–5). Správce, kteří roli už mají, ji mají dál; dvoufaktorové ověření se nemění.
5. Až web běží s novým nastavením, smaž složku `/DATA/AppData/nfnn/env` (`sudo rm -r /DATA/AppData/nfnn/env`); nic ji už nečte.

## Nginx Proxy Manager

Proxy host:
- Domain: `nfnn.znamenacek.duckdns.org` (DuckDNS posílá všechny poddomény `znamenacek` na stejnou IP)
- Forward: `http` / `192.168.1.117` / `8089`
- Block common exploits: zapnuto
- SSL: nový Let's Encrypt certifikát, Force SSL, HTTP/2, HSTS

Gzip, cache a bezpečnostní hlavičky řeší nginx ve frontend image, Advanced konfigurace v NPM není potřeba. Výjimkou bude přechod na Cloudflare: pak NPM musí brát adresu návštěvníka z `CF-Connecting-IP` (viz Obnova hesla, Adresa návštěvníka).

## Nasazení nové verze

Po merge do `main` počkej, až v Actions doběhne zeleně **Publish Docker images**. Pak v ZimaOS otevři nastavení aplikace „Nová naděje“ a klikni na **Uložit** bez jakékoli změny: ZimaOS stáhne nové image `latest` a kontejnery vytvoří znovu; data, `secrets/` i nastavení v databázi zůstanou. Tlačítko Update to neudělá (u tagu `latest` aplikaci považuje za aktuální) a samotné `docker restart` taky ne, kontejner by běžel dál ze staré image. Merge, který nemění nic v `backend/`, `frontend/`, `mcp/`, `deploy/backup/` ani `deploy/postgres/` (třeba jen dokumentaci), nové image nevydá a nasazovat není co.

Kterou verzi kontejnery mají, ukáže commit, ze kterého image vznikla; má se shodovat s commitem běhu **Publish Docker images**:

```bash
sudo docker inspect nfnn-backend nfnn-frontend nfnn-backup nfnn-postgres nfnn-mcp --format '{{.Name}} {{index .Config.Labels "org.opencontainers.image.revision"}}'
```

Uložení bere compose z poslední instalace, takže změnu `compose.yml` nepřenese; na tu je dál potřeba přeinstalace. Nastavení webu se mění ve správě na `/sprava/nastaveni` a přeinstalaci nepotřebuje.

## Zálohy

Kontejner `nfnn-backup` (image `ghcr.io/bzumik1/nfnn-backup`, skript `deploy/backup/backup.sh`) udělá `pg_dump` při každém startu a pak každou noc ve 3:00 pražského času do `/DATA/AppData/nfnn/backups/nfnn-<datum>_<čas>.dump` a maže zálohy starší než 30 dní. Každou neděli ve 4:00 nejnovější zálohu zkušebně obnoví do dočasné databáze `nfnn_restore_test`, spočítá tabulky a databázi zase smaže, takže se včas pozná záloha, ze které by se obnovit nedalo. Výsledek každého běhu je v logu kontejneru (`sudo docker logs nfnn-backup`) a v souborech `/DATA/AppData/nfnn/backups/status/`, které čte backend: správce ho vidí ve správě na stránce **Zálohy** (`/sprava/zalohy`), kde také spustí zálohu nebo zkušební obnovu hned a zálohu si stáhne (každé stažení je v historii správy, dump obsahuje údaje všech dárců). Když záloha chybí, selhala nebo je starší než 26 hodin, nebo zkušební obnova chybí, selhala nebo je starší než 8 dní, pošle backend po ranní kontrole (7:15) e-mail příjemcům měsíčního přehledu, jednou za poruchu a jednou, až zase všechno funguje.

Dump je komprimovaný zstd na úrovni 19, nejvyšší, která se vejde do limitu 256 MB paměti kontejneru (úroveň 20 nic neušetří a potřebuje kolem 170 MB, úroveň 22 kontejner zabije). Na zkušebních datech byl proti dřívějšímu gzipu asi o čtvrtinu menší; `pg_restore` kompresi pozná sám, takže obnova i starší zálohy v gzipu fungují stejně. Zálohy leží na stejném disku jako databáze, takže je potřeba je kopírovat i mimo Zimu (ZimaOS Backup, cloud sync, nebo stažení ze stránky Zálohy). Nastavení webu je v databázi, takže ho záloha obsahuje; tajné hodnoty v něm jsou ale zašifrované klíčem `secrets/settings-key`. Složku `secrets/` záloha nekopíruje: po obnově na novém serveru se heslo SMTP a token Fio zadají znovu ve správě (viz [Obnova](#obnova)). Sken podpisu je v databázi, takže se obnoví se zálohou.

Zálohu na požádání, třeba před aktualizací, spustí správce tlačítkem **Zálohovat teď** na `/sprava/zalohy` (soubor dostane příponu `-rucni`). Z příkazové řádky to samé udělá prázdný soubor ve složce požadavků, kontejner si ho do 10 sekund vezme (`rucni.test-restore` místo `.backup` spustí zkušební obnovu):

```bash
sudo touch /DATA/AppData/nfnn/backups/requests/rucni.backup
```

### Obnova

Web se obnovuje ze zálohy celý v prohlížeči, bez příkazové řádky (Jakub 23. 10. 2026):

- **Běžící web**: na `/sprava/zalohy` u zálohy tlačítko **Obnovit** → dialog řekne, co se ztratí → **Obnovit a restartovat web**. Smí to jen správce přihlášený v prohlížeči s druhým ověřením; konektor (MCP) na to nástroj nemá. Obnova se zapíše do historie správy (`RESTORE_BACKUP`, po restartu `BACKUP_RESTORED` nebo `BACKUP_RESTORE_FAILED`).
- **Nový server** (havárie, stěhování): po instalaci průvodce na `/prvni-nastaveni` nabídne **Obnovit ze zálohy**; vyber soubor `.dump` z počítače a nahraj ho. Platí stejné odemčení jako pro průvodce (přímo z domácí sítě bez kódu, odjinud kód z logu). Velkou zálohu nahraj z domácí sítě přímo na adresu Zimy s portem 8089: Cloudflare pustí nahrávání nejvýš 100 MB. Pak se přihlas svým dosavadním účtem správce.

Co se při obnově děje: backend zapíše požadavek do `backups/requests/` a restartuje se; při startu počká, dokud obnova neskončí (požadavek, který si kontejner záloh do 5 minut nevezme, zahodí a nastartuje s daty, jaká měl). Kontejner `nfnn-backup` si požadavek do 10 sekund vezme, udělá zálohu `-pred-obnovou` (má-li databáze nějaké tabulky), nahraje dump do dočasné databáze `nfnn_restore_staging` a teprve když se to povede, ji vymění za běžící (přejmenováním). Záloha bez jediné tabulky (třeba ta z úplně prvního startu čerstvé instalace) se odmítne, aby prázdný soubor nesmazal data. Když se obnova nepovede, data zůstanou, jak byla, a backend normálně nastartuje; chybu ukáže stránka Zálohy (nebo průvodce) a log kontejneru. Liquibase po startu doplní změny databáze, které jsou v běžící verzi novější než záloha. Web je během obnovy pár minut nedostupný a přihlášení, která vznikla po záloze, přestanou platit.

**Tajné hodnoty po obnově na novém serveru**: heslo SMTP a token Fio jsou v záloze zašifrované klíčem `secrets/settings-key` starého serveru a ten klíč do zálohy nikdy nejde. Nový server má vlastní klíč, takže je nepřečte: na `/sprava/nastaveni` je stránka vyjmenuje nahoře a je potřeba je zadat znovu a uložit (Jakub 23. 10. 2026). Na stejném serveru se klíč nemění a všechno funguje hned.

Pro pokročilé zůstává i cesta přes složku: soubor `.dump` v `/DATA/AppData/nfnn/restore/` kontejner záloh obnoví při svém startu (restart aplikace: v ZimaOS **Uložit** v nastavení aplikace), do prázdné databáze vždy, do databáze s daty jen soubor pojmenovaný `*.force.dump`; víc souborů `.dump` naráz se přeskočí. Probíhá stejně (záloha `-pred-obnovou`, dočasná databáze, výměna), soubor pak dostane příponu `.dump.done`, `.dump.failed` (data zůstala) nebo `.dump.skipped`; ty smaž, až je nebudeš potřebovat. Nahraná záloha z průvodce (`restore/<id>.upload`) se po obnově smaže sama, nedokončené nahrávání po hodině.

### Návrat na předchozí verzi

Každá image má vedle `latest` i tag se zkráceným commitem (7 znaků, např. `418105c`), seznam je v GitHubu u balíčků `nfnn-backend`, `nfnn-frontend`, `nfnn-backup`, `nfnn-postgres` a `nfnn-mcp`. V nastavení aplikace „Nová naděje“ v ZimaOS změň u backendu a frontendu (a zálohování, databáze nebo konektoru, měnily-li se) tag z `latest` na commit předchozí verze a klikni na **Uložit**. Zpátky na nejnovější verzi se vrátíš tagem `latest`.

Pokud novější verze měnila databázi (v jejím commitu přibyl soubor v `backend/src/main/resources/db/changelog/`), starší backend s novější databází fungovat nemusí. Pak po změně tagu obnov zálohu z doby před aktualizací (viz Obnova); dary a registrace mezi zálohou a obnovou se ztratí, platby z banky z posledních 90 dní se ale při dalším stažení z Fio doplní znovu. Proto před aktualizací, která mění databázi, udělej zálohu na požádání.

## Logy

Backend píše svůj log kromě `docker logs` i do souboru `/DATA/AppData/nfnn/logs/backend.log` (rotace po 10 MB, 14 dní, nejvýš 200 MB; složku si při startu převezme uživatel `app`, pod kterým Java běží) a zálohování připisuje výsledky do `backup.log` ve stejné složce. Frontendový nginx tam zapisuje `nginx-access.log` (každý požadavek: čas, metoda, adresa stránky bez parametrů za `?`, stav, velikost a doba odpovědi; IP adresu návštěvníka ani hledané výrazy ne) a konektor `mcp.log`; oba soubory se o půlnoci UTC přesunou do `….log.RRRR-MM-DD.gz` a archivy starší 14 dní se mažou. `sudo docker logs nfnn-frontend` dál ukazuje i adresy, jako dosud. Při startu backend zapíše řádek `Backend revision <commit> is ready` a totéž vrací `/actuator/info`, takže je vidět, kterou verzi Zima právě spouští.

Správce je čte ve webu na `/sprava/logy` a Claude přes konektor (viz [MCP konektor](#mcp-konektor)): backend tutéž složku čte sám a vystavuje ji správcům přes `GET /api/admin/operations/logs…` (celá historie po stránkách včetně rotovaných `.gz`, hledání) spolu s dočasnými úrovněmi logování a diagnostikou (`/loggers`, `/diagnostics`). Žádný port na routeru ani nic v Cloudflare k tomu není potřeba. `JWT_SECRET`, heslo databáze ani Fio token se do logů nedostanou (knihovna Fio je v chybách maskuje).

Web i konektor čtou logy přes backend, takže když backend neběží, ukáže je jen Zima: `sudo docker logs nfnn-backend` nebo `sudo tail -n 200 /DATA/AppData/nfnn/logs/backend.log`. Co v logu není: compose uložený ZimaOS, proměnné v kontejnerech a kontejner, který ZimaOS vůbec nevytvořil; na to zůstává tvůj příkaz na Zimě.

Do 23. 10. 2026 složku vystavoval ještě kontejner `nfnn-ops` přes tunel Cloudflare na `ops.nfnn.cz`. Po přeinstalaci s aktuálním `deploy/compose.yml` ho zbývá uklidit: na Zimě zmizí s celou složkou `env/` (viz [Přechod z env souborů](#přechod-z-env-souborů)), v Cloudflare Zero Trust smazat tunel `nfnn-ops` (s ním i DNS záznam `ops`), aplikaci Access `NFNN logy` a servisní token `claude-nfnn`, a z prostředí projektu na claude.ai proměnné `NFNN_OPS_CLIENT_ID` a `NFNN_OPS_CLIENT_SECRET`.

## MCP konektor

Správce může Claudovi (na claude.ai, v mobilu i v Claude Code) dát přístup do správy fondu konektorem na adrese `https://nfnn.cz/mcp` (na stagingu `https://nfnn.znamenacek.duckdns.org/mcp`). Běží v kontejneru `nfnn-mcp` za frontendovým nginxem, nemá žádné heslo ani klíč: přihlášení jde přes samotný web (stránka `/pripojeni`, účet správce s dvoufaktorovým ověřením) a každý nástroj volá stejná `/api/admin/...` jako web, takže vše je v historii správy pod jménem správce. Nástroje: stav importu a verze, přehled roku, platby, dárci, správci, odpovědi na starší symboly, zálohy, historie správy, report, aktuality a projekty, logy (seznam souborů včetně rotovaných `.gz`, čtení po stránkách od konce i od libovolné pozice, hledání regulárním výrazem), úrovně logování, diagnostika (JVM, databáze, disky, výpis vláken) a nastavení webu (u hesel a tokenů jen to, jestli jsou zadané); se zápisem navíc spárování a odpárování platby, nastavení a odeslání reportu, vyžádání zálohy nebo zkušební obnovy, psaní, úpravy a publikování aktualit a projektů, nahrání fotky k nim (z veřejné adresy obrázku, nebo souboru z počítače přes jednorázový odkaz `https://nfnn.cz/mcp-photos`, platný 10 minut), vypnutí a zapnutí párování z účtu dárce, změna nastavení webu kromě hesel a tokenů (ty mění jen správce v prohlížeči) a dočasné zvýšení úrovně logování (např. `cz.novanadeje.app` na DEBUG na 30 minut; vrátí se samo, nejdéle za 24 h, restart ho také zruší; zapsáno v historii správy).

1. Kontrola: `sudo docker ps` ukáže `nfnn-mcp` jako healthy a `curl -sS -o /dev/null -w '%{http_code}\n' -X POST https://nfnn.cz/mcp` vrátí `401`.
2. V claude.ai: Nastavení → Konektory → **Přidat vlastní konektor** → název `NFNN`, adresa `https://nfnn.cz/mcp`, nic dalšího (klient se představí sám). Po uložení klikni na Připojit: otevře se web fondu, přihlas se účtem správce včetně kódu z aplikace a na stránce „Povolit přístup ke správě aplikaci claude.ai?“ zvol rozsah a dej Povolit: čtení má aplikace vždy, změny (všechny vratné zásahy ze seznamu výše) jen když zaškrtneš „Změny“; výchozí je jen čtení. Od té chvíle má Claude v chatu nástroje `nfnn_…`. Rozsah později změníš jen tak, že konektor v claude.ai odpojíš (nebo ho odebereš v portálu dárce v části „Údaje a zabezpečení“ → „Připojené aplikace“) a připojíš znovu. Změny přes konektor jsou v `/sprava/historie` označené „přes aplikaci claude.ai“.
3. V Claude Code na počítači: `claude mcp add --transport http nfnn https://nfnn.cz/mcp` a při prvním použití `/mcp` → přihlášení v prohlížeči stejně jako výše (stránka upozorní, že jde o aplikaci na tomto počítači).
4. Odpojení: portál dárce → „Údaje a zabezpečení“ (`/darce/udaje`) → „Připojené aplikace“ → Odpojit. Připojení skončí také změnou hesla, vypnutím dvoufaktorového ověření nebo odebráním role správce; bez použití vyprší po 14 dnech. Přístupový token se odvolat nedá, takže po odpojení (i po změně hesla) může konektor ještě nejvýš 15 minut pracovat s tokenem, který už má; nový už nedostane.

Když konektor neodpovídá: `/sprava/logy` nebo `/DATA/AppData/nfnn/logs/mcp.log` (každý požadavek s metodou MCP, nástrojem, stavem a dobou: `MCP POST tools/call:nfnn_payments for donor … : 200 in 35 ms`) a `nginx-access.log` (požadavky na `/mcp` se stavem a dobou odpovědi; vlastní healthcheck kontejneru z `127.0.0.1` se tam nezapisuje), případně `sudo docker logs nfnn-mcp` (při startu zapíše `Authorization server discovered: https://nfnn.cz`; dokud se k backendu nedostane, hlásí `/health` 503 a ZimaOS ho ukazuje jako starting) a `sudo docker logs nfnn-frontend` (nginx hlásí `limiting requests` při více než 10 požadavcích za sekundu z jedné adresy). Konektor sám nic neukládá, takže ho lze kdykoli restartovat.

## Přechod na skutečnou doménu

Doména fondu je `nfnn.cz` (u WEDOS, držitel fond; DNS už u Cloudflare). Od úkolu 14 plánu v2 je `https://nfnn.cz` výchozí `PUBLIC_URL` backendu a stejná adresa je napevno v kanonických odkazech, `og:url`, `og:image`, `robots.txt` a `sitemap.xml` webu, takže web na staging adrese už odkazuje na nfnn.cz. Dokud DNS nepřepneš, musí být v nastavení webu „Adresa webu“ `https://nfnn.znamenacek.duckdns.org` (jinak odkazy v e-mailech a přihlášení konektoru vedou na doménu, která ještě neběží). Postup jako u `nakocarky.cz`:

1. DNS v Cloudflare: `nfnn.cz` CNAME `nfnn.znamenacek.duckdns.org` a `www` CNAME `nfnn.cz`, obojí Proxied; SSL/TLS v režimu Full (strict). (Poštovní záznamy už tam jsou.)
2. V NPM nový proxy host `nfnn.cz` na `192.168.1.117:8089` s certifikátem Let's Encrypt, Force SSL, HTTP/2 a HSTS, a `www.nfnn.cz` přesměrovat 301 na `https://nfnn.cz` (v Cloudflare jde totéž pravidlem Redirect Rules). V Advanced konfiguraci proxy hostu brát adresu návštěvníka z `CF-Connecting-IP` (viz Obnova hesla), jinak limity na adresu počítají Cloudflare.
3. Ve správě na `/sprava/nastaveni` změň „Adresa webu“ na `https://nfnn.cz` a ulož (web se restartuje). Zkontroluj odkaz v e-mailu (obnova hesla) a `https://nfnn.cz/.well-known/oauth-authorization-server` (`issuer` má být `https://nfnn.cz`). Přístupové klíče (passkey) patří k doméně z adresy webu: klíč vytvořený na staging adrese na `nfnn.cz` nefunguje, takže je dárci (a ty) přidávejte až po přechodu; staré klíče ze stagingu si každý odebere na kartě Přístupové klíče, nebo je správce odebere na kartě dárce.
4. Kontrola: `https://nfnn.cz/robots.txt`, `https://nfnn.cz/sitemap.xml`, náhled odkazu (`og:image` je `https://nfnn.cz/images/og-image.jpg`, zatím zástupná fotka z hera, než Jakub dodá skutečný obsah). Starý proxy host pro duckdns nech, dokud na něj něco odkazuje; sitemap zatím obsahuje jen úvodní stránku a zásady ochrany osobních údajů, aktuality a projekty do ní přibudou s generovanou mapou webu.

## E-maily

Adresa fondu je `info@nfnn.cz`. Příchozí poštu přeposílá Cloudflare Email Routing do běžných schránek, web odesílá přes Brevo (SMTP, zdarma 300 e-mailů denně). Odesílatel je adresa z pole „Odesílatel e-mailů“ (průvodce, `/sprava/nastaveni`) a má být na doméně `nfnn.cz`; odpověď na zprávu z kontaktního formuláře jde díky `Reply-To` rovnou pisateli.

1. Cloudflare → Email → Email Routing: zapni ho, ověř cílovou schránku a v Routing rules založ `info@nfnn.cz` → tu schránku. MX, SPF (`v=spf1 include:_spf.mx.cloudflare.net ~all`) a DKIM pro přeposílání přidá Cloudflare sám a zamkne je; Catch-all nech vypnutý.
2. Brevo: účet fondu (plán Free), Senders, Domains & Dedicated IPs → Domains → přidej `nfnn.cz`, brandovanou subdoménu přeskoč a zvol ruční přidání záznamů (Manual). Do Cloudflare přidej čtyři záznamy přesně podle Brevo: TXT `brevo-code:…` na `nfnn.cz`, CNAME `brevo1._domainkey` a `brevo2._domainkey` (DNS only, šedý mráček, ne Proxied) a TXT na `_dmarc` (`v=DMARC1; p=none; rua=mailto:rua@dmarc.brevo.com`). Až e-maily z webu chodí bez spamu, zpřísni DMARC na `p=quarantine`.
3. SPF neměň: Brevo odesílá z vlastní odesílací domény a za `nfnn.cz` se prokazuje podpisem DKIM, takže DMARC projde i bez `include:spf.brevo.com`. Brevo u transakčních e-mailů sleduje otevření a kliky a odkazy v HTML části vede přes svůj server (`sendibt3.com`); na plánu Free to vypnout nejde, jen na žádost u Enterprise. Odkaz pro obnovu hesla v textové části vede přímo na web a token Brevo vidí v obsahu e-mailu tak jako tak, takže to nevadí. Objeví-li se v Transactional → Settings přepínač sledování, vypni ho.
4. Brevo → SMTP & API → SMTP: vygeneruj SMTP klíč (Standard, bez expirace; Brevo ho i tak zruší po 90 dnech bez použití). Průvodce i správa už mají předvyplněný server `smtp-relay.brevo.com`, port 587 a STARTTLS; zadej přihlašovací jméno účtu fondu (`…@smtp-brevo.com`) a SMTP klíč a tlačítkem „Ověřit spojení“ zkus přihlášení.
5. Vyzkoušej kontaktní formulář: zpráva musí dojít na `info@nfnn.cz` a v jejích hlavičkách musí být `dkim=pass` a `dmarc=pass`.

Zprávy z kontaktního formuláře backend každý den ve 3:30 maže z databáze, jakmile jsou starší než rok (vlastnost `app.contact.retention.max-age`, výchozí `P365D`; v logu `Deleted … contact messages received before …`). Kopie, která přišla e-mailem do schránky fondu, tím nezmizí: zásady ochrany osobních údajů slibují, že ji fond drží jen do vyřízení dotazu, takže vyřízené zprávy z formuláře je potřeba ze schránky mazat ručně.

Každý den v 7:00 backend zkontroluje, zda už odešel měsíční přehled za minulý měsíc (registrovaní a noví dárci, přijaté dary za měsíc a od začátku roku včetně nespárovaných plateb, z toho spárované s registrovanými dárci, nespárované příchozí platby, poslední úspěšné stažení z Fio a poslední chyba), a pokud ne a nastal den odeslání, pošle ho. Komu chodí, v který den měsíce a které části obsahuje, nastaví správce ve webu na `/sprava/prehledy` (tabulka `donation_report_settings`); dokud nastavení neuložil, chodí přehled na adresu z pole „Kam chodí zprávy z kontaktního formuláře“, 1. den, se všemi částmi. Normálně tedy odejde 1. dne v měsíci; byl-li backend ten den vypnutý, odejde při nejbližší ranní kontrole. Tamtéž správce pošle přehled za kterýkoli skončený měsíc znovu; když ho SMTP odmítne, stránka to řekne a v logu je `Monthly report for RRRR-MM sent by hand` jen po úspěchu. Odeslání se zapíše do tabulky `donation_monthly_report`, takže restart ani druhá instance ho nepošle podruhé; když ho SMTP odmítne, zápis se nezachová a backend to zkusí znovu další ráno (v logu `Monthly report for RRRR-MM could not be sent`). Přehled zároveň udržuje SMTP klíč v Brevo naživu: Brevo ruší klíč, přes který 90 dní nic neodešlo, a e-maily z formuláře nebo obnovy hesla by jinak mohly přestat odcházet bez povšimnutí.

Když stahování plateb z Fio selže třikrát za sebou (výpadek spojení, nesrozumitelná odpověď, neočekávaná chyba) nebo když Fio odmítne token, pošle backend na adresy z nastavení měsíčního přehledu (bez uloženého nastavení na adresu pro kontaktní formulář) jednu zprávu „Stahování plateb z banky selhává“ s důvodem a postupem; odmítnutí kvůli limitu 30 s a zamčená historie se nepočítají. Dokud porucha trvá, další zprávy nechodí (stav je v `bank_import_state.reported_outage`, restart ho nezmění); až se stažení povede, přijde „Stahování plateb z banky zase funguje“. Když SMTP samotnou zprávu odmítne, je v logu `The Fio import alert e-mail (...) could not be sent` a `... it is sent again after the next import`; zpráva počká ve frontě a odejde po dalším stažení (každou hodinu), jakmile ji SMTP přijme.

Když e-maily neodcházejí:
- `MailAuthenticationException` s `no password specified?` v `sudo docker logs nfnn-backend`: v nastavení chybí přihlašovací jméno nebo klíč SMTP. Doplň je ve správě na `/sprava/nastaveni` („Ověřit spojení“ to zkusí bez odeslání).
- V Brevo → Transactional → Logs stav Error s `sender … is not valid`: odesílatel není na doméně `nfnn.cz`. Oprav „Odesílatel e-mailů“ ve správě na `/sprava/nastaveni`.
- Úspěšné odeslání backend do logu nezapisuje; zda zpráva odešla, ukáže log v Brevo.

## Fio API

Backend si každou hodinu stahuje pohyby na účtu fondu přes Fio API (jen čtení) a páruje je s dárci. Bez tokenu je import vypnutý a zbytek aplikace běží normálně.

1. Ve Fio internetovém bankovnictví: Nastavení → API → vytvoř token typu „Sledování účtu“ pro účet fondu. Token začne fungovat asi 5 minut po vytvoření a platí 180 dní; hned si dej do kalendáře připomínku na jeho obnovu.
2. Token vlož ve správě na `/sprava/nastaveni` do „Token Fio API“ (při instalaci v průvodci) a ulož; web se restartuje. Token nikdy necommituj. Smí obsahovat jen písmena, číslice, `-` a `_`; jiný znak správa odmítne s vysvětlením a nic neuloží.
3. První import sáhne 89 dní zpět. Má-li jít hlouběji: ve Fio odemkni historii (Nastavení → API, ikona zámku; odemčení platí 10 minut) a do 10 minut ve správě na `/sprava/nastaveni` nastav „Stáhnout platby od data“, třeba 1. 1. 2025, a ulož; restart po uložení import spustí. Dokud se hlubší období nestáhne, backend se o něj pokusí při každém dalším startu; hodinové běhy chtějí jen posledních pár dní, takže odemčení potřebuje jen start.
4. V logu backendu (`sudo docker logs nfnn-backend`) zkontroluj asi 30 s po startu řádek `Fio import STARTUP ... completed`. `failed with HISTORY_LOCKED` znamená, že historie nebyla odemčená a import zatím pokryl jen 89 dní; `failed with UNAUTHORIZED` znamená, že token chybí, ještě neplatí nebo vypršel – vytvoř nový a vlož ho stejně jako ten první. Vypršelý token nebo tři selhání za sebou ohlásí backend i e-mailem příjemcům měsíčního přehledu (viz E-maily).
5. Stav importu (pokryté období, poslední pokus a chyba) ukazuje správa na `/sprava` a konektor nástrojem `nfnn_status`. `/actuator/health` na Fio nezávisí.

### Bankovní účty dárců a sběrné účty

Účet odesílatele se dárci přiřadí z platby s jeho VS; pak se mu přiřazují i platby bez VS z toho účtu. Dárce své účty vidí v portálu v části „Bankovní účty“ (`/darce/ucty`) a u každého může párování vypnout a znovu zapnout (tlačítka „Vypnout párování“ a „Zapnout párování“, viz „Donor's bank accounts“ v `docs/api-contract.md`). Platí-li přes jeden účet víc lidí (platební brána, sbírkový nebo firemní účet zaměstnavatele), zapiš ho ve správě na `/sprava/nastaveni` do pole „Účty, podle kterých se nepáruje“ ve tvaru `číslo/kód banky`, víc účtů odděl čárkou, třeba `2400000002/2010,19-2000145399/0800`, a ulož (backend se restartuje). Z takového účtu se už žádnému dárci účet nepřiřadí a platby bez VS z něj zůstanou nespárované; platba s VS se spáruje dál podle VS. Účet, který se dárce naučil dřív, mu na nástěnce zůstane i s dosavadními dary, jen se mu z něj další platby bez VS ani platby se starším VS (níže) už nepřiřadí. Špatně zapsaný účet správa neuloží a u pole řekne proč.

Platba s VS, který žádný registrovaný dárce nemá (typicky starší VS v trvalém příkazu z doby před registrací), se podle účtu nepáruje. Když dárce ověří účet platbou 1 Kč se zprávou Ověření účtu a z účtu do dne ověření přišel právě jeden takový VS, portál se ho u účtu zeptá, jestli jsou platby s tím VS jeho. Po „Ano, jsou moje“ se mu tyto platby přiřadí hned a další při každém importu, stejně jako platby bez VS; u sdíleného nebo vyloučeného účtu se nikdo neptá. Pravidla jsou v „Older variable symbol confirmation“ v `docs/api-contract.md`. Dárce svou odpověď sám nezmění; omyl opraví správce na stránce „Starší symboly“ (`/sprava/starsi-symboly`, viz „Starší variabilní symbol: oprava odpovědi“ níže).

**Před prvním nasazením verze s otázkou na starší VS.** Otázka platí hned po nasazení, bez přepínače, a dostanou ji i dárci, kteří účet ověřili dřív. Proto předtím:

1. Do `PAIRING_EXCLUDED_ACCOUNTS` přidej připisovací účty České pošty (platby poštovní poukázkou z nich chodí s VS mnoha různých lidí) a vlastní účty fondu.
2. Zkontroluj vazby na účty ze zkušebního provozu. Patří-li vazba testovacímu dárci a účet ve skutečnosti někomu jinému, je účet sdílený: platby bez VS z něj zůstávají nespárované a na starší VS se nikdo nezeptá. Vazby dárců na účty vidíš na kartě dárce ve správě (`/sprava/darci`, vyhledej dárce a otevři ho): tlačítko „Odebrat účet“ smaže vazbu i s dary, které přes ni přišly, a s odpověďmi dárce o starších symbolech u toho účtu; platby jsou pak zase nespárované. Odebrání se odmítne, dokud některý z těch darů kryje vydané potvrzení. „Vypnout párování“ nestačí: skutečný majitel by pak dostal platby z účtu, i ty se starším VS, až ode dne po vypnutí.
3. Aby pravidlo „právě jeden VS do dne ověření“ vidělo celou historii účtu, odemkni historii ve Fio a do 10 minut nastav ve správě na `/sprava/nastaveni` pole „Stáhnout platby od data“ na 1. 1. 2025 a ulož (krok 3 v „Fio API“). Import pak asi 30 s po restartu stáhne platby od 1. 1. 2025. Dokud historie chybí, může nástěnka položit otázku, kterou by starší platby zablokovaly (třeba když z účtu dřív chodil i druhý VS).


### Starší variabilní symbol: oprava odpovědi

Odpovědi dárců na otázku u účtu vidí správce na stránce „Starší symboly“ (`/sprava/starsi-symboly`): kdo, z jakého účtu, na jaký VS, jak odpověděl („Ano, jsou moje“ nebo „Ne, nejsou moje“), kdy, a kolik darů se přes odpověď spárovalo. Nic z toho se nedělá na serveru (Jakub, 22. 10. 2026: žádná správa přes SQL); každý zásah je v historii správy.

**Omylem „Ano“**: tlačítko „Zrušit Ano“ smaže dary, které odpověď spárovala, a odpověď změní na „Ne“. Platby s tím VS pak zůstanou nespárované a dárce se na ně už nezeptá. Stránka odmítne odpověď zrušit, dokud na některý z jejích darů odkazuje vydané potvrzení: potvrzení za ten dar, nebo roční potvrzení za rok daru vystavené po jeho spárování, i když ho později nahradilo novější (vydané potvrzení zůstává vydané). Takovou odpověď nech, jak je, a řeš to s dárcem: web vydané potvrzení zrušit neumí. Zrušení bere stejný zámek jako párování, takže hodinový import ani odpověď dárce v tu chvíli nic nespárují, a zamkne řádek dárce, takže se mezitím nevystaví žádné jeho potvrzení. Roční potvrzení vystavené před spárováním darů tyto dary nepotvrzuje, takže zůstává, jak je.

**Omylem „Ne“**, nebo má-li dárce po zrušeném „Ano“ odpovědět znovu: tlačítko „Smazat Ne“ odpověď smaže a portál se dárce zeptá znovu, pokud otázka pořád platí. Odpověď „Ano“ smazat nejde; tu nejdřív zruš.

**Jména z banky.** Osoby se portál nezeptá, když banka u její ověřovací platby uvádí jméno s právní formou (`s.r.o.`, `a.s.`, `z.s.`, `o.p.s.`, `s.p.`, `p.o.`, `SVJ`, `společenství vlastníků`, `společnost`, `ústav`, `družstvo`, `nadace`, `obec`, `město`…), a firmy, když jméno právní formu nemá; platba bez jména se nekontroluje. Seznam forem je v `CounterpartyNames` v backendu. Před ostrým provozem projdi jména na skutečných ověřovacích platbách s typem dárce; stránka „Platby z banky“ u každé platby ukazuje jméno z banky a dárce, kterému patří. Objeví-li se forma, kterou seznam nezná (třeba vypsaná `příspěvková organizace` nebo `státní podnik`, nebo `farnost`), je potřeba ji do seznamu doplnit; do té doby se nástěnka může zeptat osoby i u účtu takové organizace, stejně jako když banka jméno zkrátí ještě před formou.

## Správci

Správce je obyčejný dárcovský účet s rolí `ADMIN`. Všechno kolem správců se dělá ve webu, ne na serveru (Jakub, 22. 10. 2026: žádná správa přes SQL): správa je na `/sprava`, odkaz „Správa“ se v hlavičce přehledu ukáže jen správci a backend pustí k `/api/admin/...` jen token s touto rolí. Co správa umí, ukazují stránky v jejím levém panelu (přehled, platby z banky, dárci, starší symboly, správci, aktuality, projekty, měsíční přehled, zálohy, logy a diagnostika, nastavení, historie správy); každý zásah je v tabulce `admin_action`. Platbu, které správce zrušil přiřazení, automatické párování přeskakuje, dokud ji správce nepřiřadí znovu.

Správa je dostupná z internetu, proto roli `ADMIN` dostane jen přihlášení potvrzené dvoufaktorovým ověřením.

**První správce** se zadává jen v průvodci prvním nastavením (pole „E-mail prvního správce“, viz [Instalace](#instalace)). Je-li ten e-mail už registrovaný, dostane roli při restartu po průvodci; jinak ji dostane v okamžiku, kdy registraci potvrdí odkazem z e-mailu. Ve správě se toto pole nezobrazuje: další správce přidává a odebírá jen jiný správce na stránce „Správci“. Správce odebraný ve webu roli zpět nedostane, dokud se na stránce „Správci“ znovu nepřidá; ztratí-li se všichni správci, pomůže jen obnova databáze ze zálohy, kde ještě správce byl.

**Další správce** přidá kterýkoli správce na stránce „Správci“: zadá e-mail, kterým je dárce registrovaný (účet musí existovat, jinak stránka řekne, že s tímto e-mailem není nikdo registrován). Pak:

1. Nový správce se přihlásí (zatím jako dárce) a v části „Údaje a zabezpečení“ (`/darce/udaje`) na kartě „Přihlašovací údaje“ klikne na „Zapnout dvoufaktorové ověření“: zadá heslo, naskenuje QR kód (nebo opíše klíč) do ověřovací aplikace v telefonu (Google Authenticator, Microsoft Authenticator, Aegis apod.) a zadá první kód z ní. Tím je dvoufaktorové ověření zapnuté a správce hned vidí odkaz „Správa“.
2. Od té doby se přihlašuje heslem a kódem z aplikace. Dokud dvoufaktorové ověření nezapne, přihlásí se jen jako dárce a přehled mu napíše, že správa čeká na dvoufaktorové ověření; stránka „Správci“ u něj ukazuje „vypnuté, správa se mu ještě neotevře“.

**Odebrání správce**: na stránce „Správci“ tlačítko „Odebrat“ (sám sebe správce odebrat nemůže, aby web nezůstal bez správce). Odebranému skončí všechna přihlášení; roli ztratí nejpozději do 15 minut.

**Ztracený nebo vyměněný telefon**: jiný správce mu na stránce „Správci“ (nebo u kteréhokoli dárce na jeho kartě na stránce „Dárci“) klikne na „Vypnout dvoufaktorové ověření“. Nejdřív si telefonicky ověř, že žádá opravdu majitel účtu; stránka se na to před vypnutím ptá. Dotyčnému skončí všechna přihlášení a dostane e-mail, že mu správce dvoufaktorové ověření vypnul; přihlásí se pak jen heslem a zapne si ho znovu (záložní kódy neexistují). Správce bez dvoufaktorového ověření je do té doby jen dárce.

**Žádost o výmaz podle GDPR**: ověř si, že žádá opravdu majitel účtu (odpověz na jeho e-mail, případně zavolej), na stránce „Dárci“ ho najdi podle jména, e-mailu nebo variabilního symbolu a na jeho kartě klikni na „Vymazat osobní údaje“. Web nahradí jméno, adresu, e-mail a heslo zástupnými údaji, ukončí všechna jeho přihlášení, smaže jeho bankovní účty a odpovědi o starších symbolech a pošle mu na dosavadní e-mail potvrzení. Dary a vydaná potvrzení o daru zůstávají (jsou to účetní doklady), jen bez jména; nic se nemaže ze záloh, ty se otáčejí samy po 30 dnech. Výmaz je nevratný a zapíše se do historie správy. Správce vymazat nejde: nejdřív mu jiný správce odebere roli. Další platby s variabilním symbolem vymazaného dárce zůstanou nespárované (přiřadit je jde ručně na stránce „Platby z banky“); kdyby se dárce vrátil, zaregistruje se znovu a dostane nový symbol.

Kdo je správce vidíš na stránce „Správci“. Co kdo kdy udělal ukazuje stránka „Historie správy“ (`/sprava/historie`, tabulka `admin_action`): nejnovější nahoře, po 50 záznamech, u každého správce (i bývalého), čas, druh zásahu, čeho se týkal a technický popis.

## Potvrzení o daru

Přihlášený dárce si v portálu stáhne potvrzení o daru v PDF: za jeden dar kdykoli, za celý rok od 1. ledna následujícího roku, obojí jen za dary přijaté od 1. ledna 2026 (viz „Od kterého roku“ níže). Bez jakéhokoli nastavení potvrzení podepisuje Pavel Znamenáček, předseda správní rady, a místo obrázku podpisu je jen čára se jménem. Jiného podepisujícího nastavíš ve správě na `/sprava/nastaveni` v části „Potvrzení o daru“ (pole „Kdo podepisuje potvrzení“ a „Jeho funkce“); prázdné pole vrací výchozí hodnotu.

**Sken podpisu** nahraješ ve správě na `/sprava/nastaveni` v části „Potvrzení o daru“, oddíl „Sken podpisu“: JPEG, PNG nebo WebP do 10 MB, nejlépe tmavý podpis na bílém papíře (stačí fotka z mobilu, web ho sám zmenší nejvýš na 1 200 × 600 px a uloží jako PNG). Uloží se hned, bez restartu, a nese ho každé potvrzení vystavené potom; už vystavená potvrzení si nechávají podpis, se kterým vznikla. Tlačítkem „Odebrat podpis“ se vrátíš k čáře se jménem. Nahrání i odebrání je v historii správy; konektor stav podpisu jen čte. Sken je v databázi, takže ho obsahuje i denní záloha.

**Od kterého roku.** Web vystavuje potvrzení jen za dary přijaté od 1. ledna roku z pole „Potvrzení na webu od roku“ ve správě na `/sprava/nastaveni` (`RECEIPT_FIRST_YEAR`), bez nastavení od roku 2026: za dřívější dary mohl potvrzení vystavit fond sám a dárce nemá dostat dvě. Přehled dárce starší dary ukazuje dál, jen u nich nenabízí PDF, a o potvrzení za takový dar nebo za dřívější rok backend odpoví chybou „Za dary z této doby potvrzení na webu nevystavujeme“ (`donations/receipt-before-first-year`). Má-li web vystavovat i za rok 2025, nastav ve správě rok 2025 a ulož (backend se restartuje). Prázdné pole znamená 2026; rok mimo 2000–2100 správa neuloží a u pole řekne proč. Potvrzení vystavené, dokud platil dřívější rok, v tabulce zůstane, ale po posunutí roku dopředu se už stáhnout nedá. Změna `RECEIPT_FIRST_YEAR` potřebuje i PR, který upraví větu „od 1. ledna 2026“ v zásadách ochrany osobních údajů (`@@content.privacy.donations.purpose` ve `frontend/src/app/features/content/privacy-policy/privacy-policy.html`), posune datum účinnosti zásad a upraví `privacy-policy.spec.ts`.

Vystavené potvrzení se neukládá jako PDF. Tabulka `donation_receipt` drží jen údaje, které na potvrzení stojí (zhruba 1 kB), a odkaz na šablonu, logo a podpis, se kterými vzniklo; šablona s texty je v tabulce `receipt_template` a obrázky v `receipt_image`, každá verze jen jednou. Každé stažení PDF vykreslí znovu a vyjde bajt po bajtu stejný soubor jako poprvé. Změna podepisujícího, podpisu nebo šablony proto platí jen pro nově vystavená potvrzení; už vystavená zůstávají se svou šablonou i svým podpisem, i když ve správě nahraješ jiný sken. Změní-li dárce jméno nebo adresu a potvrzení si stáhne znovu, vystaví se náhradní potvrzení s novým číslem a staré zůstává v tabulce jako nahrazené; náhrada přidá jen další řádek s údaji, takže tabulka i denní záloha rostou pomalu.

Najednou se vykreslují nejvýš tři potvrzení, další stažení chvíli počkají. Kdyby po Novém roce stahování vázlo a server měl volnou paměť i procesor, jde limit zvýšit PR, který změní vlastnost `app.donations.receipt.concurrent-renders` (výchozí `3`) v `backend/src/main/resources/application.yml`; ve správě to nastavení není.

## Aktuality, projekty a fotky

Správce píše aktuality na `/sprava/aktuality` a projekty na `/sprava/projekty` a k nim nahrává fotky. Fotka smí být JPEG, PNG nebo WebP do 10 MB; backend ji otočí podle EXIF, zmenší na šířky 480, 960 a 1 440 px (nikdy nezvětšuje) a uloží jen tyto kopie ve WebP do tabulky `content_media_variant` (originál se nedrží). Fotky tedy leží v databázi: denní záloha (`pg_dump`) je obsahuje a na serveru není žádný další svazek. Jedna fotka zabere zhruba 150–400 kB, takže záloha roste pomalu; jak záloha roste, ukazuje velikost souborů na `/sprava/zalohy`.

Limit 10 MB hlídá backend (`spring.servlet.multipart.max-file-size`, odpověď 413 „Soubor je příliš velký“) a nginx ve frontend kontejneru pouští na `/api/` 11 MB (`client_max_body_size` ve `frontend/nginx.conf`). Nginx Proxy Manager pouští 2000 MB a Cloudflare 100 MB, nic se v nich nenastavuje; kdyby nahrání velké fotky vracelo 413 dřív, než se objeví hláška webu, je limit tam.

Převod do WebP dělá knihovna `webp-imageio` s nativní libwebp pro Linux x64 i arm64; backend proto startuje s `--enable-native-access=ALL-UNNAMED` (v Dockerfile), jinak Java 25 jen vypíše varování do logu. Smazaná aktualita nebo projekt smaže i svou fotku; fotka nahraná a nikdy nepřipojená k aktualitě ani projektu v tabulce zůstane (zatím se neuklízí).

## Obnova hesla

Dárce, který zapomněl heslo, si v přihlašovacím okně (záložka „Obnovit heslo“) nechá poslat odkaz e-mailem, na stránce `/obnova-hesla` si nastaví nové heslo a přihlásí se jím. Odkaz platí hodinu a jde použít jen jednou; po změně hesla backend ukončí všechna přihlášení dárce (přístupový token, který už prohlížeč má, ještě nejvýš 15 minut platí). Odkazy jsou v tabulce `donor_password_reset_token`, která se uklízí sama.

- **Adresa v odkazu.** Odkaz v e-mailu se skládá z `PUBLIC_URL`, adresy, na které návštěvníci web otevírají. Zadává se v průvodci a mění ve správě na `/sprava/nastaveni` (pole „Adresa webu“); dokud web běží jen na staging adrese, musí tam být `https://nfnn.znamenacek.duckdns.org` (po přechodu na doménu ji přepiš na `https://nfnn.cz`). Adresu bez `http://` či `https://` nebo s `?` či `#` průvodce ani správa neuloží.
- **Bez SMTP e-maily neodcházejí.** Dokud ve správě na `/sprava/nastaveni` nejsou vyplněné server, přihlašovací jméno a heslo SMTP (a případně odesílatel), kontaktní formulář i obnova hesla odpovídají, jako by zprávu odeslaly, ale žádný e-mail neodejde. U obnovy hesla je jediným příznakem řádek `Password reset e-mail for donor … could not be sent: …` v `sudo docker logs nfnn-backend`, zakončený jen třídou výjimky: s přihlášením zapnutým bez jména a hesla je to `MailAuthenticationException`, u nedostupného serveru `MailSendException`; z bezpečnostních důvodů v něm není adresa ani podrobnosti chyby. SMTP proto zkoušej tlačítkem „Ověřit spojení“ ve správě (přihlásí se k serveru bez odeslání e-mailu) a výsledek odeslání hledej v Brevo → Transactional → Logs.
- **Odesílatel.** Všechny e-maily (kontaktní formulář, obnova hesla i měsíční přehled) odcházejí z adresy v poli „Odesílatel e-mailů“ (`MAIL_FROM`), které průvodce prvním nastavením vyžaduje a správa mění na `/sprava/nastaveni`. E-mail s odkazem má jako jméno odesílatele „Nová naděje – nadační fond“. Před ostrým provozem potřebuje doména odesílatele SPF, DKIM a DMARC, jinak odkazy skončí ve spamu.
- **Omezení.** Z jedné adresy návštěvníka jde poslat nejvýš 5 žádostí za hodinu (šestá dostane odpověď 429) a jeden dárce má nejvýš 3 platné odkazy najednou; další žádost do hodiny nic nepošle. Kdo zná adresu dárce, může jeho tři odkazy na hodinu obsadit; kdyby se to dělo, řešením je CAPTCHA.
- **Adresa návštěvníka.** Limit na adresu počítá s tím, že Nginx Proxy Manager posílá hlavičku `X-Forwarded-For` (dělá to sám od sebe) a nginx ve frontend image z ní vezme adresu návštěvníka a hlavičky poslané klientem zahodí. Po přechodu na Cloudflare musí NPM brát adresu návštěvníka z `CF-Connecting-IP` (v Advanced konfiguraci proxy hostu `real_ip_header CF-Connecting-IP;` a `set_real_ip_from` pro rozsahy adres Cloudflare), jinak limit počítá adresy Cloudflare a jedna jeho adresa může zablokovat obnovu hesla, přihlášení i registraci mnoha návštěvníkům naráz. Klient z privátní adresy, který se k frontend nginx dostane přímo a ne přes NPM – v lokálním `docker-compose.yml` i na serveru z domácí sítě přes port 8089 – si svou adresu pro limit může vymyslet; z internetu to nejde, a doma to nevadí.

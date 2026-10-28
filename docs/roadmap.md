# Roadmapa

Co web umí po verzích a co čeká v zásobníku. Verze je ucelený blok práce, aplikace sama číslo verze nenese (nasazuje se podle commitu). Podrobnosti hotových funkcí jsou v `requirements.md` (rozhodnutí klienta) a v přehledech `system-overview.md`, `frontend-overview.md` a `security-overview.md`.

Udržuje se v každém PR, který funkci dokončí nebo o ní rozhodne, i v PR jen s dokumentací, které kontrola v CI nehlídá: hotová funkce se přesune z backlogu nebo z části „Rozpracováno“ do tabulky aktuální verze nebo do jejího řádku „Mimo očíslované úkoly“, rozhodnutí o nápadu ji přesune mezi částmi backlogu. Číslo PR se doplní dalším commitem po otevření PR. Oprava, aktualizace závislostí nebo úprava uvnitř hotové funkce do roadmapy nepatří; takový PR má v popisu řádek `Roadmapa: beze změny`. Další verzi vybere Jakub z části „Schváleno“; do té doby žádná plánovaná verze není.

## v1: hotovo (17.–22. 10. 2026)

Veřejný web a účet dárce. Čísla jsou úkoly plánu v1; úkoly 9–12 a 18 toho plánu dokončila v2 (obsah z API, logy, MCP, vzhled e-mailů, ověření e-mailu).

| # | Úkol | PR |
|---|---|---|
| 1 | Kontaktní formulář: e-mail fondu, honeypot, limit, chyby jako `problem+json` | #5 |
| 2 | Registrace a přihlášení dárce (člověk i firma), vlastní VS, `/darce` | #9 |
| 3 | QR platba v sekci Přispět, přihlášenému s jeho VS; skutečný účet a údaje fondu | #8, #10, #18 |
| 4 | Hodinový import z Fio a párování podle VS a naučeného účtu, kontrola banky při otevření přehledu; vlastní knihovna `fio-api` na Maven Central | #7, #11, #15, #19 |
| 5 | Přehled darů dárce se souhrnem po letech | #12 |
| 6 | Potvrzení o daru v PDF, roční i k jednomu daru, zmrazené s náhradou při změně; prohlášení a podepisující | #13, #20, #45, #53 |
| 7 | Obnova hesla e-mailem | #16 |
| 8 | Zásady ochrany osobních údajů, mazání zpráv z formuláře po roce | #6, #54 |
| 13 | Prettier v CI | #65 |
| 14 | ESLint s angular-eslint | #66 |
| 15 | Hesla: SHA-256 před BCrypt | #67 |
| 16 | OnPush u všech komponent | #69 |
| 17 | Content-Security-Policy | #70 |

Mimo očíslované úkoly:

- Obrazy z GitHubu a nasazení na ZimaOS, tajné údaje v env souborech (později nahradilo první nastavení), zálohy a obnova, postup návratu na předchozí verzi (#1, #3, #17, #43, #44, #55).
- Pošta přes doménu nfnn.cz a Brevo (#24, #35, #36), zprávy pro příjemce v QR platbách (#40).
- Bankovní účty dárce: ověření platbou 1 Kč, vypnutí a zapnutí párování, sdílené a vyloučené účty, dialog „Přidat účet“ (#34, #48, #56, #57); účel daru „Ověření účtu“ (#50).
- Starší VS: dárce po ověření účtu potvrdí svůj dřívější symbol (#71).
- Měsíční přehled e-mailem (#41); potvrzení jako šablona a data místo uložených PDF (#42, #46).
- Audit vzhledu a oddělení vzhledu od chování, kontrast a klávesnice, kopírování údajů, úprava údajů dárce (#21–#23, #25–#33), limity přihlášení a registrace, ikona webu (#51, #52).
- Pravidla pro Clauda, Dependabot (#58).

## v2: aktuální (od 22. 10. 2026)

Účet a e-maily, administrace, konektor pro Clauda a spuštění na nfnn.cz.

| # | Úkol | PR |
|---|---|---|
| | **Blok 1: účet dárce a e-maily** | |
| 1 | Jednotný vzhled e-mailů | #72 |
| 2 | Ověření e-mailu při registraci | #73 |
| 3 | Změna e-mailu a hesla v přihlášeném stavu | #74 |
| 4 | E-mail při výpadku importu | #75 |
| | **Blok 2: administrace** | |
| 5 | Kostra administrace `/sprava`, audit; druhý faktor TOTP | #76, #77 |
| 6 | Nespárované platby a ruční párování | #79 |
| 6b | Správci bez SQL | #81 |
| 6c | Starší symboly a historie změn ve správě | #84 |
| 7 | Dárci ve správě, výmaz podle GDPR | #88, #89 |
| 8 | Aktuality, projekty, úvodní stránka z API a stránky detailů | #91, #92, #93 |
| 9 | Nastavení měsíčního přehledu a přehledy pro správce | #90 |
| 10 | Zálohy, zkušební obnova a obnova | #94 |
| | **Blok 3: logy a MCP** | |
| 11 | Logy do souborů a verze při startu (čtečka `ops` později odstraněna) | #95, #114 |
| 12 | Konektor MCP: připojení aplikací přes `/pripojeni`, kontejner `nfnn-mcp` | #97, #98 |
| 17 | Diagnostika: logy, dočasné úrovně logování, stránka `/sprava/logy` | #105, #108, #110 |
| 18 | Konektor: všechna nastavení a data kromě nevratných akcí | #112 |
| 19 | Opravy konektoru z auditu, fotky přes konektor | #115, #118 |
| | **Blok 4: spuštění na nfnn.cz** | |
| 13 | Skutečný obsah úvodní stránky | zbývá, viz níže |
| 14 | Přechod na nfnn.cz: canonical, `og:*`, `robots.txt`, `sitemap.xml` | #99; krok na serveru zbývá, viz níže |
| 15 | Bezpečnostní revize před spuštěním a oprava jejího nálezu (token připojené aplikace jen pro správu) | #100 |
| 16 | Zálohy mimo server a hlídání dostupnosti | zbývá, viz níže |

Mimo očíslované úkoly:

- Přístupové klíče: přihlášení klíčem, účet jen s klíči, přejmenování klíčů (#113, #119, #120); druhý faktor pro změny faktorů správce a pro připojení aplikace (#117, #146); vypnutí druhého faktoru platbou 1 Kč (#147); odmítání běžných hesel (#142).
- První nastavení serveru v prohlížeči místo env souborů (#116), obnova ze zálohy v prohlížeči (#121), plán záloh ve správě (#145), podpis potvrzení nahraný ve správě (#123), silnější komprese záloh (#80).
- Postranní panel správy a účtu dárce (#109, #122), cíl po přihlášení (#103), čtení nebo změny při připojení aplikace (#102), součty všech přijatých darů (#106), hledání bez diakritiky, historie česky, volitelná hodina přehledu (#139), Markdown a popisky fotek (#143), staré adresy obsahu, mazání nepoužitých fotek, seznamy po stránkách (#144), e-maily k účtu a opakování upozornění (#134).
- Bezpečnostní audit: vlastní databázová role, zpevněné kontejnery, jedna síť `nfnn-edge`, role správce jen s potvrzeným e-mailem (#125, #148, #149, #150).
- Vzhled a přístupnost: české adresy (#78), vzhled QR kódu (#101), fotka a ikona (#107, #111), vyměnitelný vzhled a sdílené bloky (#124, #126, #127, #132, #136, #138, #140), přístupnost pro klávesnici, čtečky a zvětšení (#133), audit přehlednosti celého webu (#151–#156).
- Údržba: úspora minut CI (#82), aktualizace závislostí (#83, #96), fokus po přihlášení (#104), cizí klíče s indexy a test migrací nad daty (#141), čísla potvrzení po obnově a české locale (#129), pravidla pro Clauda (#128).

Rozpracováno (audit přehlednosti, rozhodnuto 24. 10. 2026):

- Zkušební e-mail z nastavení pošty a nastavení seřazené podle četnosti, technická část sbalená (#157).
- Karta „Přihlášení a zabezpečení“ v účtu dárce: řádky e-mail, heslo, klíče, kód z telefonu, každý se svou akcí.
- Moje dary seskupené po letech s odkazem na potvrzení roku.
- Čekající změna e-mailu zůstane vidět i po obnovení stránky (Poslat znovu, Zrušit).
- Hledání, období a stránkování plateb ve správě.
- Registrace firmy s doplněním názvu a sídla z ARES (bez ARES registrace funguje dál).
- Obnova platbou 1 Kč vrátí už zahájenou obnovu se stejným kódem a ukáže QR kód.
- Po registraci ze sekce Přispět tlačítko zpět k příspěvku, QR už s VS dárce.

Zbývá před spuštěním na nfnn.cz:

- Skutečný obsah úvodní stránky (texty, příběhy, čísla, fotky) od Jakuba a Pavla; rozhodnout o „100 % transparentně“ a o vlastních fotkách místo fotobanky.
- Řádek „Výroční zprávy“ v O nás, až budou PDF.
- Přechod na doménu nfnn.cz na serveru (postup v `deploy/README.md`).
- Hlídání dostupnosti zvenčí; kopie záloh mimo server až po spuštění (šifrované, viz „Šifrované zálohy“ v backlogu).
- Sběrné účty a vlastní účty fondu vyloučit z párování (`/sprava/nastaveni`).
- Odemčení historie ve Fio a hluboký import do 1. 1. 2027, aby potvrzení za rok 2026 obsahovala všechny dary.
- Zátěžová zkouška vydávání potvrzení před Novým rokem.
- Odpovědi od Pavla: seznam dřívějších VS dárců, zda fond vystavil potvrzení za rok 2025 (pak potvrzení na webu i za 2025), zda je účet transparentní.
- Provozní kroky Jakuba z bezpečnostního auditu (seznam je mimo veřejné repo).

## Backlog

### Schváleno

Funkce, které Jakub schválil 27. 10. 2026 při plánování dalšího vývoje. Pořadí ani verze zatím nejsou určené.

Pravidla pro všechny (Jakub 27. 10. 2026):

- Každé datum, lhůtu a čas nastavuje správce ve správě; v kódu je jen výchozí hodnota. Platí i pro stávající pevné lhůty (smazání zpráv po roce, připomínka registrace, kontrola záloh, mazání nepoužitých fotek).
- Každý automatický e-mail jde ve správě zapnout a vypnout. Upozornění na poruchy jdou vypnout s varováním, bezpečnostní e-maily k účtu (ověření, obnova hesla, změna e-mailu, hesla, klíče či druhého faktoru) zůstávají vždy zapnuté.

Peníze a potvrzení:

- Ruční dar mimo Fio (hotovost, jiný účet): zapíše správce, počítá se do potvrzení, v historii.
- Vrácení daru, celé i částečné, s náhradním potvrzením.
- Označení příchozí platby „není dar“ s důvodem: mimo součty a nespárované, řádek „Jiné příjmy“, vratné.
- Roční potvrzení jen za rok, který import pokrývá celý; jinak dárce vidí „připravujeme“ a správce varování s návodem.
- Karta „Připraveno na potvrzení“ od prosince a vzorové PDF s vodoznakem VZOR, které se nevydá.
- Data pro výroční zprávu a export pro účetní; dárce může odmítnout uvedení jménem (zákonné požadavky ověřit před stavbou).
- Přehled, kdo si nestáhl roční potvrzení, a jedna připomínka 15. února s odkazem na web.

Dárci:

- Úvodní e-mail: správce vloží e-maily dárců, kteří žádali o potvrzení, a web jim pošle, jak se zaregistrovat a potvrzení stáhnout.
- Lednový e-mail registrovaným dárcům: potvrzení je připravené, jen odkaz na web, bez PDF.
- Poděkování za každý spárovaný dar (odhlásitelné v profilu); dary starší 7 dní spárované najednou shrne jeden e-mail.
- Upozornění správci na vynechaný trvalý příkaz.
- Aktuality e-mailem registrovaným dárcům, s odhlášením.
- „Chybí vám tu dar?“ v Moje dary: běžné důvody, kontrola banky a formulář fondu s VS dárce.
- Text v Přispět, že pravidelný dar pomáhá plánovat pomoc; řádek o odpočtu daru z daní s ikonou podrobností.
- Prohlídka účtu při prvním přihlášení, znovu spustitelná z položky „Nápověda / průvodce“.

Správa:

- Úprava jména, adresy a IČO dárce správcem (dárce dostane e-mail; e-mail a heslo mění jen dárce).
- Stažení a vydání potvrzení dárce z jeho karty.
- Poznámky ke kartě dárce.
- Nespárované platby seskupené podle odesílatele, hromadné přiřazení.
- Seznam dárců ke stažení s filtrem (všichni, dali v roce, nad částku).
- Zprávy z kontaktního formuláře ve správě se stavem vyřízeno.
- Čísla na úvodní stránce upravitelná ve správě.
- Oznámení na webu nebo v účtu dárce (text, odkaz, od–do).
- Tisknutelný QR kód pro akce a letáky.
- Prohlídka všech funkcí správy při první návštěvě, znovu spustitelná z „Nápověda / průvodce“.
- E-mail správci o nové registraci s odkazem na kartu dárce.

E-maily:

- Fronta automatických a hromadných e-mailů s denním limitem (výchozí 250), opakováním a stavem odesláno / čeká / selhalo; bezpečnostní e-maily jdou hned.
- Odeslané e-maily na kartě dárce (datum, druh, stav, bez obsahu).
- „Poslat zkušebně mně“ před každým hromadným e-mailem.

Web jako aplikace (Jakub 28. 10. 2026; zařadit až za funkce pro lednová potvrzení):

- Instalovatelný web: manifest se stávajícími ikonami, service worker jen pro upozornění (bez offline ukládání), po nasazení výzva „Nová verze, načíst znovu“.
- Rozhraní jako aplikace (Jakub 28. 10. 2026): správa a účet dárce nemají zvláštní verzi pro aplikaci, ale všude dostanou rozvržení jako mobilní aplikace, v nainstalované aplikaci (telefon, Mac přes „Přidat do Docku“) i v prohlížeči. Na telefonu spodní lišta se záložkami, řádky seznamu místo tabulek a karet, panely zespodu místo dialogů, šipka zpět v hlavičce (nainstalovaná aplikace na iPhonu nemá tlačítko zpět) a respektované okraje displeje; na širokých obrazovkách zůstává boční panel. Barvy, písma a logo dál určuje vyměnitelné téma. Veřejná část zůstává webem (úvod, aktuality, projekty a jejich stránky, zásady ochrany údajů, přihlášení, registrace, obnova hesla). Nainstalovaná aplikace se otevře správci ve správě, dárci v jeho přehledu, jinak na úvodu. Aplikace má i sekci „Novinky“: jeden proud aktualit a projektů od nejnovějších, karta s fotkou přes celou šířku a detail přes celou obrazovku se šipkou zpět; čte stejný obsah a stejnou správu jako web, liší se jen rozvržením. Návrh lišty dárce: Přehled, Dary (i s potvrzeními), Novinky, Účet; později možná upozornění na nový projekt pro dárce, kteří o ně stojí. Před stavbou návrhy obrazovek na telefonu (přehled, platby, karta dárce).
- Upozornění na telefon pro správce (Web Push s klíči vygenerovanými v prvním nastavení, bez Firebase): správce je zapne na každém zařízení zvlášť ve správě; posílají se stejné poruchy jako dnes e-mailem (výpadek a obnovení importu, hlídání záloh) a nově selhání odesílání pošty, takže upozornění nezávisí na e-mailu. Každé má vypínač a tlačítko na zkoušku; zpráva nese jen druh problému a odkaz, žádná jména ani částky. Adresa pro doručení projde stejnou kontrolou jako stahování fotek, mrtvá přihlášení se mažou. Volitelně počet otevřených problémů na ikoně. Později stejný základ pro dárce s přihlášením k odběru v profilu.
- Délka přihlášení: v nainstalované aplikaci 90 dní od posledního použití pro dárce i správce; v prohlížeči 14 dní jen se zaškrtnutým „Zapamatovat si mě“ (výchozí vypnuto), jinak do zavření prohlížeče. Obě délky nastavuje správce.
- Omezení: na iPhonu upozornění chodí až po přidání webu na plochu (iOS 16.4 a novější); výpadek celého serveru dál pozná jen hlídání dostupnosti zvenčí.

Veřejný web a provoz:

- Tlačítko Sdílet u aktualit a projektů (Web Share API, kopírování odkazu).
- Instagram (Jakub 28. 10. 2026, plně automaticky, protože ho nikdo nebude mít čas spravovat): zveřejnění projektu nebo aktuality na webu ji samo publikuje na Instagram fondu (titulní fotka a krátký popisek s odkazem), bez dalšího kroku. Zapíná a vypíná se ve správě, token se obnovuje sám a při selhání přijde e-mail. Jednorázově je potřeba založit profesionální účet na Instagramu a aplikaci Meta; fond zatím účet nemá.
- Chyby z prohlížeče do logu, bez osobních údajů.
- Jedna hláška „Web se právě aktualizuje“ při restartu serveru.
- Záložní stránka při výpadku serveru (Jakub 28. 10. 2026, místo druhého serveru s automatickým přepnutím): Worker na Cloudflare před nfnn.cz propouští vše beze změny; když server neodpoví nebo vrátí chybu brány, ukáže při otevření stránky v prohlížeči vlastní stránku „Web je dočasně nedostupný“ s číslem účtu, QR platbou bez částky a kontaktním e-mailem. Volání `/api` a `/mcp` vrací původní chybu. Stránka nic nenačítá odjinud, běží na bezplatném plánu Workerů a cesta je nastavená tak, aby po vyčerpání limitu web jel dál bez ní. Nasazení na Cloudflare je jednorázový krok Jakuba.
- E-mail při docházejícím místě na disku.
- Smazání registrací, které nikdo nepotvrdil do 30 dnů.
- Šifrované zálohy (Jakub 28. 10. 2026): každá záloha je zašifrovaná; dnes jsou výpisy databáze nešifrované a zapečetěné jsou jen heslo k poště a token Fio. Klíč vznikne v prvním nastavení, které nepokračuje, dokud správce nepotvrdí, že si ho uložil (opíše jeho poslední 4 znaky; nabídne se stažení nebo tisk). Klíč zůstává i na serveru, takže zkušební obnova a obnova ve správě fungují dál. Ve správě u záloh ho jde zobrazit jen z prohlížeče, každé zobrazení vyžaduje nové ověření druhým faktorem (kód nebo passkey), zapíše se do historie a konektor k němu nemá přístup. Dokud správce uložení nepotvrdí, správa ho upozorňuje. K rozhodnutí: zda klíč chrání i klíč nastavení, aby obnova na novém serveru zachovala heslo k poště a token Fio. Je to první krok záloh mimo server, ať vyhraje jakékoli úložiště.

### Možná později

- Návrhy párování pro nespárované platby.
- Dar na konkrétní projekt s ukazatelem vybrané částky.
- Dárkový certifikát.
- Loga partnerů.
- Export vlastních darů dárcem (CSV).
- Žádosti rodin o pomoc (citlivé údaje o zdraví; nejdřív zjistit, jak je fond vyřizuje dnes).
- Roční shrnutí, co se z darů podařilo.
- Formulář „Chci pomoct jinak“.
- Darovací smlouva v PDF pro firmy.
- Hromadné stažení potvrzení a adresy pro poštu.
- Stránka častých otázek.
- Role správce jen pro čtení (účetní, správní rada).
- Export osobních údajů dárce na žádost podle GDPR.
- Upravitelné texty e-mailů ve správě.
- Nedoručené e-maily z Brevo.
- Evidence vydaných potvrzení v ročním exportu.
- Výdaje fondu.
- Odhlášení na všech zařízeních.
- Návštěvnost přes Umami bez cookies.
- Stránka Dokumenty (výroční zprávy, statut).
- Vlastní náhled odkazu aktuality a projektu při sdílení.
- Stará doména nfnovanadeje.cz s přesměrováním a přeposílání starého e-mailu.
- Platba kartou online (vlastní brána nebo Darujme.cz).
- Angličtina.
- Změna odpovědi na starší VS dárcem samým; účty s více staršími VS v měsíčním přehledu.
- Další rozšíření přehledu dárce (z původního zadání; část pokrývají schválené funkce).
- Strukturovaná data fondu pro vyhledávače (`Organization`, IČO, účet).
- Výmazy podle GDPR zachovat i po obnově ze starší zálohy.
- Zkušební prostředí (staging).

### Zamítnuto

- Roční potvrzení jako PDF v e-mailu: dárci mají chodit na web.
- Dárci bez účtu založení správcem: dárce se zaregistruje sám; úvodní e-mail mu v tom pomůže.
- Bankovní účet nebo platba v úvodním e-mailu.
- Smazání účtu dárcem: výmaz dělá správce na žádost.
- Připomínka výročí daru: pokrývají ji aktuality e-mailem.
- Upozornění na konec platnosti tokenu Fio: s automatickým prodloužením se token obnovuje při každém přihlášení do bankovnictví.
- E-mail o přihlášení z nového zařízení.
- Oznámení dárci, že se změnilo jeho stažené potvrzení.
- Sídlo a číslo účtu v patičce.
- Seznam povolených aplikací pro připojení ke správě: připojit se smí jakákoli aplikace se souhlasem správce.

# Roadmapa

Co web umí po verzích a co čeká v zásobníku. Verze je ucelený blok práce, aplikace sama číslo verze nenese (nasazuje se podle commitu). Podrobnosti hotových funkcí jsou v `requirements.md` (rozhodnutí klienta) a v přehledech `system-overview.md`, `frontend-overview.md` a `security-overview.md`.

Udržuje se v každém PR, který funkci dokončí nebo o ní rozhodne, i v PR jen s dokumentací, které kontrola v CI nehlídá: hotová funkce se přesune z backlogu nebo z části „Rozpracováno“ do tabulky aktuální verze nebo do jejího řádku „Mimo očíslované úkoly“, rozhodnutí o nápadu ji přesune mezi částmi backlogu. Číslo PR se doplní dalším commitem po otevření PR. Oprava, aktualizace závislostí nebo úprava uvnitř hotové funkce do roadmapy nepatří; takový PR má v popisu řádek `Roadmapa: beze změny`. Další verzi vybírá Jakub z části „Schváleno“; v3 vybral 29. 10. 2026.

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

## v2: dokončuje se spuštěním na nfnn.cz (od 22. 10. 2026)

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
- První nastavení serveru v prohlížeči místo env souborů (#116), obnova ze zálohy v prohlížeči (#121), plán záloh ve správě (#145), podpis potvrzení nahraný ve správě (#123), silnější komprese záloh (#80), šifrované zálohy s klíčem v prvním nastavení a ve správě, které nesou i heslo k poště a token Fio (#162), klíč k zálohám jako 24 slov s ověřením na samostatném kroku (#192, #194).
- Postranní panel správy a účtu dárce (#109, #122), cíl po přihlášení (#103), čtení nebo změny při připojení aplikace (#102), součty všech přijatých darů (#106), hledání bez diakritiky, historie česky, volitelná hodina přehledu (#139), Markdown a popisky fotek (#143), staré adresy obsahu, mazání nepoužitých fotek, seznamy po stránkách (#144), e-maily k účtu a opakování upozornění (#134), kategorie projektu podle toho, komu pomohl, a řazení projektů v roce podle ní: děti, dospělí, zvířata, ostatní (Jakub 30. 10. 2026, #246); volba řazení ve správě i v konektoru: podle roku a kategorie, jen podle roku, nebo podle kategorie a roku, každá s popisem (Jakub 30. 10. 2026, #249).
- Bezpečnostní audit: vlastní databázová role, zpevněné kontejnery, jedna síť `nfnn-edge`, role správce jen s potvrzeným e-mailem (#125, #148, #149, #150).
- Vzhled a přístupnost: české adresy (#78), vzhled QR kódu (#101), fotka a ikona (#107, #111), vyměnitelný vzhled a sdílené bloky (#124, #126, #127, #132, #136, #138, #140), přístupnost pro klávesnici, čtečky a zvětšení (#133), audit přehlednosti celého webu (#151–#156), zkušební e-mail z nastavení pošty a nastavení seřazené podle četnosti (#157), karta „Přihlášení a zabezpečení“, dary po letech a čekající změna e-mailu v účtu dárce (#183), editor aktualit a projektů s náhledem a lištou akcí (#185), obnova platbou 1 Kč vrací zahájenou obnovu s QR kódem a registrace ze sekce Přispět vede zpět k příspěvku (#187), hledání, období a stránkování plateb ve správě a historie změn jako věty (#189), registrace firmy s názvem a sídlem z ARES (#191), blok „Kdo fond vede“ s portréty zakladatelů Pavla a Andrey a správní radou v O nás a karta „Údaje pro účetní“ v Kontaktu po uživatelských testech (Jakub 30. 10. 2026), fotka v O nás nahraná ve správě, protože zobrazuje dítě, s popisem, popiskem a odebráním kdykoli (Jakub 30. 10. 2026), Lidé fondu ve správě (`/sprava/lide-fondu`): blok „Kdo fond vede“ z lidí v pořadí od správce s portréty, řádkem správní rady, slovem zakladatelů a podpisy na webu, které nahrává správce v prohlížeči i konektor (#252), s řádkem pod správní radou pro dobrovolníka, který se stará o web, a s osobním e-mailem a e-mailem ve fondu jen pro správu (Jakub 30. 10. 2026).
- Údržba: úspora minut CI (#82), aktualizace závislostí (#83, #96), fokus po přihlášení (#104), cizí klíče s indexy a test migrací nad daty (#141), čísla potvrzení po obnově a české locale (#129), pravidla pro Clauda (#128).

Zbývá před spuštěním na nfnn.cz:

- Skutečný obsah úvodní stránky (texty, příběhy, čísla, fotky) od Jakuba a Pavla; rozhodnout o „100 % transparentně“ a o vlastních fotkách místo fotobanky (fotku v O nás už nahraje správce v `/sprava/o-nas`).
- Řádek „Výroční zprávy“ v O nás, až budou PDF.
- Přechod na doménu nfnn.cz na serveru (postup v `deploy/README.md`).
- Hlídání dostupnosti zvenčí; kopie záloh mimo server až po spuštění (zálohy jsou už šifrované; Jakub vybírá úložiště: Cloudflare R2, iCloud přes zkratku v iPhonu, nebo obojí).
- Sběrné účty a vlastní účty fondu vyloučit z párování (`/sprava/nastaveni`).
- Odemčení historie ve Fio a hluboký import do 1. 1. 2027, aby potvrzení za rok 2026 obsahovala všechny dary.
- Odpovědi od Pavla: seznam dřívějších VS dárců, zda fond vystavil potvrzení za rok 2025 (pak potvrzení na webu i za 2025), zda je účet transparentní.
- Provozní kroky Jakuba z bezpečnostního auditu (seznam je mimo veřejné repo).

## v3: rozpracováno (od 29. 10. 2026)

Logika v prohlížeči (zásada „local first“) a web jako aplikace. Plán prošli experti po oblastech a dvě nezávislé kontroly; Jakub ho schválil 29. 10. 2026 a plán je mimo veřejné repo. Každý krok je samostatný PR s testy psanými předem, srovnáním s v2 a nezávislou kontrolou; každou fázi před předáním projdou všichni experti a ověří ji proti v2. Dokud web neběží naostro, nasazuje se fáze najednou.

| Fáze | Obsah | PR |
|---|---|---|
| 0 | Vzor v2 pro srovnání, sdílené testovací případy obou stran, kešování souborů aplikace, limity podle adresy | zbývá |
| 1 | Do lednových potvrzení: nasazení najednou 26. 11. 2026, opravy do 14. 12., zmrazení 15. 12. – 31. 1., u potvrzení jen přidávání do 4. 5. 2027 | zbývá |
| 2 | Web jako aplikace, od února 2027 | zbývá |

Fáze 1:

- QR platba v prohlížeči (Jakub 28. 10. 2026; před lednovými potvrzeními): QR kód pro platbu i pro aplikaci s kódem (druhý faktor) vytváří prohlížeč a platební QR se překresluje hned při psaní částky. Údaje účtu a texty zpráv pro příjemce (dar, ověření účtu) dál určuje jen server; prohlížeč si je pamatuje a při jejich změně QR překreslí. QR kódy kreslí vlastní modul aplikace bez knihovny, ověřený na stejných případech jako server; QR pro aplikaci s kódem už kreslí prohlížeč, platební QR přijde s další částí.
- PDF potvrzení vykresluje prohlížeč (Jakub 28. 10. 2026; po QR a před lednovými potvrzeními): server přiděluje čísla a u vydaného potvrzení zmrazí údaje i texty; rozvržení potvrzení je součástí aplikace a jeho vzhled se řídí motivem webu. Znovu stažené starší potvrzení má stejné údaje, číslo i ověřovací QR, jen v současném vzhledu. Co je pro PDF potřeba, se načte až po kliknutí na stažení a čekání (asi 2 s) vyplní ukazatel průběhu. Dosavadní potvrzení jsou jen testovací a při přechodu se smažou; převod by byl potřeba jen při přechodu po spuštění. Měření ukázalo, že ani vykreslování na serveru není úzké hrdlo (46–64 ms na potvrzení), takže zátěžová zkouška před Novým rokem odpadá. Potvrzení vydaná při listopadových zkouškách se před spuštěním smažou a číslování v lednu začne od 000001 (Jakub 29. 10. 2026). Kreslení v prohlížeči se zapne rovnou, bez souběžné serverové zálohy; do ledna jde vrátit předchozí verzi.
- Hlášení chyb z prohlížeče (Jakub 28. 10. 2026; od prvního potvrzení kresleného v prohlížeči): aplikace sama pošle do logu serveru chyby PDF, QR, šifrování a synchronizace. Hlášení nese jen druh chyby, kde nastala, verzi aplikace a typ prohlížeče, nikdy jména, částky ani čísla potvrzení. Počet hlášení je omezený, správce je vidí ve správě i přes konektor a zásady ochrany údajů je zmiňují.
- Ověřovací QR na potvrzení (Jakub 28. 10. 2026; před lednovými potvrzeními, aby ho mělo každé skutečné potvrzení za rok 2026; první návrh, security expert ho může změnit): server jednou podepíše přesně to, co je na papíře (číslo, fond, dárce s adresou, rok nebo den, dary s dnem a částkou, celkovou částku; žádné účty). QR je odkaz na nfnn.cz/overit, který nese údaje v sobě, takže je server při ověření nevidí. Ověří ho kdokoli bez účtu a i bez připojení: fotoaparátem telefonu, čtečkou ve správě v nainstalované aplikaci nebo kliknutím v PDF. Ukáže zelenou značku „podepsáno fondem“, datum vystavení a dary a řekne, že potvrzení platilo ke dni vystavení. Upřesněno 29. 10. 2026: QR nese vždy všechny dary, u dlouhých potvrzení je větší; klíč vznikne sám na serveru při prvním nastavení a ověřovací stránka si jeho veřejnou část stáhne ze serveru a uloží; s připojením navíc řekne, zda fond potvrzení mezitím nenahradil nebo nezrušil (server se dozví jen otisk potvrzení, ne kdo ověřuje).
- Stažení a vydání potvrzení dárce z jeho karty (Jakub 29. 10. 2026: už v první fázi v3, jako záloha pro dárce, kterým stahování nefunguje). Vydávat smí i Claude přes konektor, jedno i hromadně; PDF kreslí jen prohlížeč.
- Vydaná potvrzení vymazaného dárce zůstávají na serveru jako účetní doklad, ze zařízení zmizí a e-mail o výmazu i zásady ochrany údajů to řeknou pravdivě (Jakub 29. 10. 2026).

Fáze 2 (až po lednových potvrzeních, včetně dat v zařízení):

- Instalovatelný web: aplikace se uloží v zařízení (i s tím, co potřebuje pro PDF) a běží i bez připojení. Vždy je nejnovější (Jakub 28. 10. 2026): při každém připojení se sama aktualizuje bez nabídky, v bezpečnou chvíli, nikdy uprostřed rozepsaného formuláře, a server nabízí jen poslední verzi.
- Data v zařízení (Jakub 28. 10. 2026, zásada „local first“): dary a údaje vydaných potvrzení se ukládají v zařízení, v prohlížeči i v nainstalované aplikaci, natrvalo a šifrovaně; čitelné jsou jen po přihlášení a odhlášení je nesmaže. Klíč zná jen zařízení, server ho nikdy nemá. Dárce data odemkne jednou při přihlášení a zůstanou odemčená, dokud přihlášení trvá; správa je odemyká při každém otevření aplikace (Face ID nebo otiskem přes přístupový klíč, jinak heslem). Zařízení drží všechny roky, takže celou historii jde bez připojení procházet i prohledávat. Výmaz dárce podle GDPR jeho údaje vymaže nebo nahradí i na všech zařízeních, dárcových i každého správce, při jejich příští synchronizaci; zařízení, které se už nikdy nepřipojí, je dál drží zašifrované (posoudí security expert, zmíní zásady ochrany údajů). Server se obnovuje jen ze záloh; kopie v zařízeních slouží jen k prohlížení bez připojení, nikdy jako zdroj obnovy. Používá-li zařízení víc lidí, má každý účet vlastní zašifrovanou kopii, čitelnou jen po přihlášení dotyčného. Změna udělaná nad zastaralými daty se odmítne a správce uvidí, co se mezitím změnilo, a rozhodne znovu; pozdější změna nikdy potichu nepřepíše dřívější (například když dva správci párují stejnou platbu). Zařízení drží jen údaje, nikdy hotová PDF; potvrzení se při každém stažení vykreslí znovu. Bez připojení jde vše jen prohlížet: přehled ukazuje stav z posledního připojení s jeho datem a jde znovu stáhnout jen už vydané potvrzení; každá změna i nové číslo potvrzení potřebují server. Přihlášení nabídne nezaškrtnutou volbu „Cizí počítač, nic neukládat“ spojenou se „Zapamatovat si mě“, aby v okně nebyla dvě podobná políčka; běžné přihlášení tím nezíská žádný krok navíc; „Smazat data z tohoto zařízení“ je jen v nastavení účtu, vedle „Načíst data znovu“, které s připojením zahodí kopii v zařízení a stáhne vše znovu. V prohlížeči jde data odemknout bez připojení (heslem nebo Face ID) i po skončení přihlášení, jen k prohlížení; přihlásit se na server jde jen online. Bez připojení hlavička ukazuje štítek „Offline · údaje z 12:30“ a tlačítka pro změny jsou vypnutá s textem „Potřebuje připojení“; s návratem sítě štítek zmizí. Každá synchronizace nese od serveru krátký souhrn (počet darů a součet po letech); když nesedí, aplikace data potichu stáhne znovu a pošle hlášení chyby. Správa si ukládá všechna svá data (všichni dárci a platby) a bez připojení v nich jde listovat a hledat; aby byla co nejsoběstačnější, počítá své přehledy (dary po měsících, nespárované platby, součty) prohlížeč správce z této kopie (Jakub 28. 10. 2026). Server tytéž přehledy počítá dál pro měsíční e-mail a konektor; že obě strany dají stejná čísla, hlídá společná sada testovacích případů (stejné vstupy, stejné výsledky), kterou spouští testy serveru i aplikace, a totéž platí pro každou logiku, která je na obou stranách. Kde prohlížeč uložení nezaručuje (anonymní okno, mazání v Safari po 7 dnech, málo místa), aplikace nic nehlásí: data se snaží udržet, a když je prohlížeč smaže, po přihlášení se tiše stáhnou znovu. Šifrování a synchronizaci navrhnou při stavbě architekt a security expert; odebrání role správce smaže kopii správy na každém zařízení dotyčného při jeho příštím připojení (jeho vlastní dárcovská data zůstanou); security expert posoudí zařízení, které se už nikdy nepřipojí. Evolu i Keryx z projektu Linky experti 29. 10. 2026 posoudili a nepoužijí (zdrojem dat zůstává server, klíč pro ověření dodává server); z Linky se převzala kontrola českého čísla účtu proti IBAN, ochrana před opakovaným znovunačtením, hlídač startu aplikace a bezpečné mazání dat v zařízení.
- Zařízení v účtu (Jakub 29. 10. 2026; pro dárce i správce): seznam zařízení s typem a posledním použitím a odhlášení jednoho nebo všech. Odhlášené zařízení nestáhne nic nového a znovu se synchronizuje až po novém přihlášení (správce s druhým faktorem).
- Změny živě (Jakub 29. 10. 2026): dokud je aplikace otevřená, server jí přes otevřené spojení řekne, že se něco změnilo (nová platba z importu, změna jiného správce), a aplikace stáhne jen to; nahrazuje pravidelné dotazování. Zavřená aplikace se synchronizuje při příštím otevření. Prohlížeče dovolí doručení na pozadí jen s viditelným upozorněním, takže tichá synchronizace na pozadí není; viditelná upozornění zůstávají tam, kde už jsou v plánu.
- Web běží i při výpadku serveru (Jakub 28. 10. 2026, upřesněno 29. 10.; až po „Data v zařízení“, bez kopie v zařízení by aplikace neměla co ukázat; místo druhého serveru s automatickým přepnutím): Cloudflare drží celou webovou aplikaci ve své mezipaměti; soubory aplikace jsou jako dnes a úvodní stránku ověří u serveru při každém otevření, takže pravidlem zůstává nejnovější verze. `/api` a `/mcp` se nikdy neukládají. Když server neodpovídá, Cloudflare vydá aplikaci sám a ta běží jako bez připojení: dárci a správa vidí data uložená v zařízení, veřejná část naposledy uloženou podobu a změny počkají, až server zase poběží. Záložní stránka „Web je dočasně nedostupný“ s číslem účtu, QR platbou bez částky a kontaktním e-mailem zůstává jen pro to, co v mezipaměti není; nic nenačítá odjinud a po vyčerpání bezplatného limitu Cloudflare web jede dál bez ní. Samotnou záložní stránku jde nasadit dřív, nezávisle na datech v zařízení. Nastavení na Cloudflare je jednorázový krok Jakuba.
- Přehled dárce z uložených dat (Jakub 28. 10. 2026): přehled se ukáže hned z dat uložených v zařízení a na pozadí se stáhne jen to, co se od minula změnilo (i odebrané dary), nic znovu. Součty, souhrn po letech a filtr roku počítá prohlížeč; od kdy a do kterého roku jdou potvrzení stáhnout, dál určuje server, ne hodiny v zařízení. Postup synchronizace navrhne architekt.
- Veřejná část bez připojení (Jakub 28. 10. 2026): aktuality, projekty a Přispět (s QR platbou z uložených údajů účtu) se ukážou v naposledy viděné podobě s upozorněním, že nemusí být aktuální. Kontaktní formulář potřebuje připojení. K rozhodnutí: fotky aktualit a projektů bez připojení (návrh: jen už viděné, ve velikosti pro danou obrazovku).
- Rozhraní jako aplikace (Jakub 28. 10. 2026): správa a účet dárce nemají zvláštní verzi pro aplikaci, ale všude dostanou rozvržení jako mobilní aplikace, v nainstalované aplikaci (telefon, Mac přes „Přidat do Docku“) i v prohlížeči. Na telefonu spodní lišta se záložkami, řádky seznamu místo tabulek a karet, panely zespodu místo dialogů, šipka zpět v hlavičce (nainstalovaná aplikace na iPhonu nemá tlačítko zpět) a respektované okraje displeje; na širokých obrazovkách zůstává boční panel. Barvy, písma a logo dál určuje vyměnitelné téma. Veřejná část zůstává webem (úvod, aktuality, projekty a jejich stránky, zásady ochrany údajů, přihlášení, registrace, obnova hesla). Nainstalovaná aplikace se otevře správci ve správě, dárci v jeho přehledu, jinak na úvodu. Aplikace má i sekci „Novinky“: jeden proud aktualit a projektů od nejnovějších, karta s fotkou přes celou šířku a detail přes celou obrazovku se šipkou zpět; čte stejný obsah a stejnou správu jako web, liší se jen rozvržením. Návrh lišty dárce: Přehled, Dary (i s potvrzeními), Novinky, Účet; později možná upozornění na nový projekt pro dárce, kteří o ně stojí. Před stavbou návrhy obrazovek na telefonu (přehled, platby, karta dárce).
- Tlačítko „Sdílet“ u aktualit a projektů (Jakub 29. 10. 2026), na jejich veřejných stránkách i v sekci „Novinky“ aplikace: otevře sdílení zařízení s názvem a odkazem na stránku; kde ho prohlížeč nemá, odkaz zkopíruje. Nic nenačítá odjinud a server se nemění.
- Co se změnilo od poslední návštěvy (Jakub 29. 10. 2026; s daty v zařízení; první krok hotový: blok „Od posledního přihlášení“ na přehledu správy s novými platbami, čekajícími na přiřazení a novými dárci počítá zatím server od předchozího přihlášení správce, Jakub 29. 10. 2026 „Obojí“, PR #206; verze níže ho později nahradí): při otevření správy nahoře souhrn toho, co přibylo od minula na tomto zařízení: nové platby a kolik z nich čeká na přiřazení, noví registrovaní dárci, vydaná potvrzení a co mezitím udělal jiný správce. Prohlížeč to pozná porovnáním uložené kopie s tím, co právě stáhl, server nic nového nepočítá ani neukládá. Souhrn jde jedním kliknutím zavřít a každý řádek vede na svou stránku.
- Rozepsaný text se neztratí (Jakub 29. 10. 2026): rozepsaná aktualita, projekt, nastavení, profil dárce a později poznámka ke kartě dárce zůstanou v zařízení (osobní údaje v šifrované kopii) i po zavření karty, vybití telefonu nebo konci přihlášení; při dalším otevření se nabídne „Pokračovat v rozepsaném“ nebo „Zahodit“. Uložení dál potřebuje připojení a kliknutí. Veřejný kontaktní formulář ne, na cizím počítači by text zůstal dalšímu člověku.
- Upozornění na telefon pro správce (Web Push s klíči vygenerovanými v prvním nastavení, bez Firebase): správce je zapne na každém zařízení zvlášť ve správě; posílají se stejné poruchy jako dnes e-mailem (výpadek a obnovení importu, hlídání záloh) a nově selhání odesílání pošty, takže upozornění nezávisí na e-mailu. Každé má vypínač a tlačítko na zkoušku; zpráva nese jen druh problému a odkaz, žádná jména ani částky. Adresa pro doručení projde stejnou kontrolou jako stahování fotek, mrtvá přihlášení se mažou. Volitelně počet otevřených problémů na ikoně. Později stejný základ pro dárce s přihlášením k odběru v profilu.
- Délka přihlášení: v nainstalované aplikaci přihlášení nikdy nevyprší, pro dárce i správce (Jakub 29. 10. 2026); skončí jen odhlášením, odhlášením na dálku ze seznamu zařízení nebo změnou hesla. Správu dál chrání odemykání při každém otevření a odhlášení na dálku. V prohlížeči 14 dní jen se zaškrtnutým „Zapamatovat si mě“ (výchozí vypnuto), jinak do zavření prohlížeče; tuto délku nastavuje správce.
- Omezení: na iPhonu upozornění chodí až po přidání webu na plochu (iOS 16.4 a novější); výpadek celého serveru dál pozná jen hlídání dostupnosti zvenčí.
- Hromadná potvrzení ve správě (Jakub 28. 10. 2026): nová potvrzení potřebují připojení a vykreslí je prohlížeč správce s ukazatelem průběhu; už vydaná jdou stáhnout znovu i bez připojení. Podoba je otevřená (návrh: jedno PDF k tisku a ZIP).

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
- Portrét předsedy správní rady nahraný ve správě (Jakub 30. 10. 2026): jedna čtvercová fotka nahraná jednou v `/sprava/nastaveni` jen z prohlížeče, stejně jako podpis potvrzení, a web si z ní sám udělá ořezy pro každé použití. Na potvrzení stojí vedle podpisu v podpisové kartě (rozvržení „dopis“: místo a datum vlevo, vpravo karta s fotkou, „Za …:“, podpisem, jménem a funkcí; stavba v plánu v3), dál v poděkováních za dary vedle podpisu (kulatý ořez s bílými rohy a světlým okrajem kvůli tmavému režimu) a v sekci O nás (blok „Kdo fond vede“ zatím ukazuje pevné fotky Pavla a Andrey z webu; nahraná nahradí tu Pavlovu). Bez nahrané fotky zůstane všude podoba bez ní. Portréty pro O nás už nahrává správce v Lidech fondu (`/sprava/lide-fondu`, Jakub 30. 10. 2026); potvrzení o daru budou podepisujícího i jeho portrét brát z Lidí fondu ve v3 (krok 1.16), do té doby zůstává podpis potvrzení v nastavení „Potvrzení o daru“ a podpis na webu s ním nemá nic společného.
- Upozornění správci na vynechaný trvalý příkaz.
- Aktuality e-mailem registrovaným dárcům, s odhlášením.
- „Chybí vám tu dar?“ v Moje dary: běžné důvody, kontrola banky a formulář fondu s VS dárce.
- Text v Přispět, že pravidelný dar pomáhá plánovat pomoc; řádek o odpočtu daru z daní s ikonou podrobností.
- Prohlídka účtu při prvním přihlášení, znovu spustitelná z položky „Nápověda / průvodce“.

Správa:

- Úprava jména, adresy a IČO dárce správcem (dárce dostane e-mail; e-mail a heslo mění jen dárce).
- Poznámky ke kartě dárce.
- Nespárované platby seskupené podle odesílatele, hromadné přiřazení.
- Seznam dárců ke stažení s filtrem (všichni, dali v roce, nad částku).
- Zprávy z kontaktního formuláře ve správě se stavem vyřízeno.
- Čísla na úvodní stránce upravitelná ve správě.
- Oznámení na webu nebo v účtu dárce (text, odkaz, od–do).
- Tisknutelný QR kód pro akce a letáky.
- Prohlídka všech funkcí správy při první návštěvě, znovu spustitelná z „Nápověda / průvodce“.
- E-mail správci o nové registraci s odkazem na kartu dárce.
- Připomínky termínů fondu (Jakub 29. 10. 2026): seznam termínů ve správě (název, datum, každý rok nebo jednou, poznámka). Měsíc a týden předem přijde správcům e-mail a úvod správy ukáže kartu „Blíží se termín“, dokud ho někdo neoznačí jako vyřízený; předstih jde nastavit a e-mail vypnout. Konec registrace domény nfnn.cz si server zjišťuje sám jednou denně z veřejného registru, takže se po prodloužení posune bez zásahu; ostatní termíny (výroční zpráva do sbírky listin, funkční období správní rady) zadá správce.
- Náhled dopadu před přiřazením nebo zrušením přiřazení platby (Jakub 29. 10. 2026): ještě před potvrzením správa ukáže, kterému dárci a za který rok se nahradí potvrzení, zda si ho dárce už stáhl a jak se změní jeho součet a měsíc v přehledech. Spočítá to prohlížeč z dat správy, rozhoduje dál server a při mezitímní změně platí jeho odpověď. Stejně u vrácení daru a označení „není dar“.

Zabezpečení správy (Jakub 29. 10. 2026, návrhy bezpečnostního experta):

- Ostatní správci se dozví o každém zásahu do přístupů: krátký e-mail všem správcům při přidání nebo odebrání správce, připojení nebo odpojení aplikace, stažení nebo obnově zálohy, změně podpisu potvrzení, vypnutí druhého faktoru či klíčů jinému správci a změně, kam web posílá e-maily (příjemci přehledu a upozornění, adresa kontaktního formuláře; tu dostanou i dosavadní příjemci). Připojení a odpojení aplikace se zapíše do historie změn. Jsou to bezpečnostní e-maily, nejdou vypnout; o přihlášeních nechodí.
- Nevratná akce ve správě chce nové ověření kódem nebo klíčem (otisk, Face ID) těsně před sebou: výmaz dárce, obnova a stažení zálohy, udělení a odebrání role správce, vypnutí druhého faktoru nebo klíčů jinému, podpis potvrzení, hesla, tokeny a adresa webu. Běžná práce (párování, obsah, nastavení) se to netýká.
- Přístupy všech správců na stránce Správci: jak se kdo přihlašuje (klíč, nebo heslo s kódem), kdy se naposledy přihlásil a jaké aplikace má připojené, s jakým oprávněním a kdy byly naposledy použité. Jiný správce takovou aplikaci odpojí (majitel si ji může připojit znovu). Kdo se dlouho nepřihlásil (lhůta ve správě, výchozí 6 měsíců), má štítek „dlouho nepřihlášen“ a ostatním se nabídne odebrání role; sama se role nikdy neodebere.
- Konektor Claudovi řekne, které údaje pocházejí zvenku (zpráva pro příjemce, jméno odesílatele, údaje dárce, zprávy z formuláře) a že se podle nich nesmí jednat; Claude se u změny, kterou by takový text vyvolal, napřed zeptá správce a podezřelou zprávu označí.
- Kontakt pro hlášení bezpečnostních chyb: standardní soubor `security.txt` na webu s e-mailem fondu a datem platnosti (nastavitelné, obnovu připomenou termíny fondu) a v repozitáři návod, jak chybu nahlásit soukromě.

E-maily:

- Fronta automatických a hromadných e-mailů s denním limitem (výchozí 250), opakováním a stavem odesláno / čeká / selhalo; bezpečnostní e-maily jdou hned.
- Odeslané e-maily na kartě dárce (datum, druh, stav, bez obsahu).
- „Poslat zkušebně mně“ před každým hromadným e-mailem.
- E-maily od fondu na jednom místě (Jakub 29. 10. 2026): v profilu dárce vypínač pro každý druh e-mailu (poděkování, lednový e-mail, únorová připomínka, aktuality); každý takový e-mail má odkaz „Odhlásit tyto e-maily“, který funguje bez přihlášení, a schránky jako Gmail u něj ukážou vlastní tlačítko Odhlásit. Bezpečnostní e-maily se odhlásit nedají.

Veřejný web a provoz:

- Instagram (Jakub 28. 10. 2026, plně automaticky, protože ho nikdo nebude mít čas spravovat): zveřejnění projektu nebo aktuality na webu ji samo publikuje na Instagram fondu (titulní fotka a krátký popisek s odkazem), bez dalšího kroku. Zapíná a vypíná se ve správě, token se obnovuje sám a při selhání přijde e-mail. Jednorázově je potřeba založit profesionální účet na Instagramu a aplikaci Meta; fond zatím účet nemá.
- Více fotek u projektu a aktuality (Jakub 30. 10. 2026): kromě titulní fotky galerie dalších fotek, ve správě i přes konektor s pořadím a popiskem každé fotky, na webu pod textem s prohlížením na celou obrazovku (šipky, klávesy, posun prstem). Dnes má každý projekt a aktualita jen titulní fotku a text obrázky nevkládá; po zavedení se k projektům z let 2023–2025 doplní další fotky z jejich sbírek na Doniu.
- Lidé fondu propojení s účty (Jakub 30. 10. 2026, postaví se hned po Lidech fondu): člen se propojí s účtem na webu, jehož potvrzený e-mail se shoduje s jeho osobním e-mailem nebo e-mailem ve fondu; propojení nedává žádná práva. Propojený správce má u svého profilu portrét člena (hotovo v #256: odznak ve správě a portrét v horní liště). Aktualita je podepsaná členem fondu s portrétem, jménem a rolí pod článkem: výchozí je člen propojený s autorem, ve „Podepsáno“ jde zvolit jiného člena, takže správce mimo fond může psát za předsedu; jde to nastavit i přes konektor (hotovo v #257).
- Profilová fotka dárce (Jakub 30. 10. 2026, dobrovolná): v rozložení aplikace je účet vpravo nahoře jako kulatý obrázek, s fotkou, kterou dárce nahrál, jinak s iniciálami (například JZ). Fotku vidí jen dárce ve svém účtu a správci, dárce ji kdykoli smaže a zmizí i s výmazem dárce. Při stavbě se upraví zásady ochrany osobních údajů. Vzhled lišty a obrázku je ve v3, krok 2.1.
- Jedna hláška „Web se právě aktualizuje“ při restartu serveru.
- E-mail při docházejícím místě na disku.
- Smazání registrací, které nikdo nepotvrdil do 30 dnů.

### Možná později

- „Stáhnout moje data“ (Jakub 28. 10. 2026: možná později): dárce si stáhne všechna svá data v jednom souboru sestaveném v prohlížeči; pokryje i přenositelnost podle GDPR.
- Sloučení dvou účtů jednoho dárce ve správě (dary, ověřené účty a odpovědi o starších symbolech na jeden účet, náhradní roční potvrzení, jen na webu).
- Prosincová výzva dárcům ke kontrole jména a adresy, jak budou na potvrzení.
- Upozornění ve správě, když má web jen jednoho správce.
- Správa jen s přístupovým klíčem (volitelný přepínač, až budou mít klíč všichni správci).
- Jedno hledání napříč celou správou z dat v zařízení.
- Grafy darů v přehledech správy a dárce.
- Trvalý příkaz dárce jako jeden řádek v jeho přehledu.
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
- Doplnění plateb z nahraného výpisu banky: chybějící historii řeší odemčení historie ve Fio.

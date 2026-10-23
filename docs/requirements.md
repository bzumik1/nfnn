# Zadání: web Nadačního fondu Nová naděje

Výsledek rozhovoru s Jakubem (klient), 17. 10. 2026. Popisuje **první verzi**; co přijde později, je v části 7.
Legenda: ✅ potvrdil Jakub · 🔸 návrh nebo převzato z repa, nenamítal · ❓ otevřené

## 1. Cíl

Web fondu, který představí fond a jeho pomoc dětem, usnadní darování a dárcům dá účet s přehledem darů po letech a s ročním potvrzením o daru ke stažení.

✅ Priorita: nejdřív **úvodní stránka** a **stránka pro dárce**. Administrace až potom.

## 2. Uživatelé

- **Návštěvník**: čte o fondu, napíše přes kontaktní formulář, přispěje.
- **Dárce** ✅: člověk i firma, stovky darů ročně. Má účet, vidí své dary, stahuje potvrzení.
- **Správce** ✅: netechnický člověk. Administrace není v první verzi; na začátku vše nastaví Jakub.

## 3. Úvodní stránka

- ✅ Vzhled a sekce podle původního prototypu (modrý akcent, fullscreen hero, zaoblené karty; dnes hotové v theme `frontend/src/styles/themes/_nova-nadeje.scss` a v komponentách, prototyp byl z repa odstraněn 22. 10. 2026): Domů, O nás, čísla, Projekty (karty dětí), Aktuality, Přispět, Kontakt (formulář), patička s IČO a zápisem v rejstříku.
- ✅ Texty, příběhy, čísla, fotky a údaje fondu (účet, IČO, adresa) jsou v prototypu zástupné. Skutečné dodá Jakub.
- ✅ **Přispět**: návštěvník zvolí částku (100 / 500 / 1000 / jiná) a vygeneruje se QR platba na účet fondu. Přihlášenému dárci QR obsahuje jeho variabilní symbol, takže se dar spáruje sám.
- 🔸 K tomu jen stránka **Zásady ochrany osobních údajů**, nutná kvůli registraci. Další stránky (detaily projektů a aktualit, dokumenty) až postupně ✅.

## 4. Stránka pro dárce

### Registrace a přihlášení
- ✅ Přepínač „člověk / firma“. Člověk: jméno, adresa, e-mail, heslo. Firma: název, IČO, sídlo, e-mail, heslo. Adresa a IČO jsou povinné hned, protože patří na potvrzení.
- 🔸 Přihlášení e-mailem a heslem, obnova hesla e-mailem (jako v prototypu).
- 🔸 Po registraci dostane dárce vlastní variabilní symbol, který vidí v přehledu.
- ✅ Účet si dárce sám smazat nemůže; přidá se později. 🔸 Žádost o výmaz podle GDPR zatím vyřídí fond ručně (e-mailem); záznamy o darech zůstávají kvůli účetnictví.
- ✅ Ověření e-mailu při registraci (Jakub 22. 10. 2026): registrace pošle e-mail s odkazem platným 24 hodin, do jeho otevření je účet neaktivní (nejde se přihlásit, platby se k jeho VS nepárují). Otevřením odkazu se účet aktivuje a dárce je rovnou přihlášen. Nový odkaz si dárce nechá poslat z přihlášení nebo ze stránky s neplatným odkazem (nejvýše 3 živé odkazy, 5 žádostí za hodinu z jedné adresy). Opakovaná registrace stejného e-mailu: u potvrzeného účtu se nic nezakládá a majitel dostane e-mail, že účet už má; nepotvrzenou registraci nahradí nová. Dárci registrovaní před touto změnou jsou považováni za potvrzené. Výchozí volby Claude, Jakub je zatím neschválil jednotlivě.
- ✅ Změna e-mailu a hesla v přihlášeném stavu (úkol 3 plánu v2, 22. 10. 2026): obojí jen se současným heslem. Nové heslo platí hned, ostatní přihlášení dárce skončí, to aktuální zůstává. Nový e-mail se nejdřív potvrdí odkazem (stejný mechanismus jako ověření při registraci, 24 hodin, nejvýše 3 živé odkazy, 5 žádostí za hodinu z jedné adresy); do potvrzení platí původní adresa, po potvrzení dostane původní adresa oznámení a ostatní přihlášení skončí. Adresa, kterou má jiný účet: odpověď je stejná, místo odkazu dostane majitel adresy upozornění. Výchozí volby Claude, Jakub je zatím neschválil jednotlivě.
- ✅ E-mail při poruše importu (úkol 4 plánu v2, 22. 10. 2026): na `REPORT_RECIPIENT` odejde jedna zpráva, když stažení plateb z Fio selže třikrát za sebou (odmítnutí kvůli 30 s limitu a zamčená historie se nepočítají, jsou to běžné stavy s vlastním opakováním) nebo když Fio hned napoprvé odmítne token (vypršel po 180 dnech), a jedna, až se stažení obnoví. Zpráva říká, co selhalo, co udělat a kdy se stažení naposledy povedlo; dokud porucha trvá, další pokusy nic neposílají (stav je v databázi, restart zprávu neopakuje). Když selže samo odeslání, zapíše se chyba do logu backendu a zpráva se neopakuje. Výchozí volby Claude (tři selhání, jen e-mail, bez opakování), Jakub je zatím neschválil jednotlivě.

### Přehled
- ✅ Jako v prototypu: celkem darováno, počet darů, poslední dar, tabulka plateb.
- ✅ Navíc souhrn po letech: rok, počet darů, částka.

### Potvrzení o daru
- ✅ Hlavně **roční potvrzení**, ke stažení po skončení roku jako PDF. Nic se neposílá, dárce si ho stáhne, když potřebuje.
- ✅ Potvrzení k jednotlivému daru navíc, pokud nebude složité (je to stejná šablona s jedním řádkem).
- 🔸 Obsah: údaje fondu (název, IČO, sídlo), údaje dárce, seznam darů s datem a částkou, celková částka, účel, datum vystavení, číslo potvrzení.
- 🔸 Podpis: jméno a funkce podepisujícího a naskenovaný podpis jako obrázek, který jde vyměnit bez úpravy kódu. Bez razítka (zákon formu nepředepisuje, razítko nemá právní váhu).
- 🔸 Vystavené potvrzení se už nemění: první stažení ho vystaví s číslem a uloží, další stažení vrací tentýž soubor. Změní-li se potvrzované údaje (pozdě spárovaná platba toho roku, změna jména nebo adresy dárce), další stažení vystaví náhradní potvrzení s novým číslem, které uvádí, jaké potvrzení nahrazuje. Jazyk podle preferovaného jazyka dárce v době vystavení; anglické potvrzení je dvojjazyčné.
- ✅ Za fond podepisuje Pavel Znamenáček, předseda správní rady (Jakub 18. 10. 2026). Jméno, funkce a sken podpisu jsou nastavení serveru (`RECEIPT_SIGNATORY_NAME`, `RECEIPT_SIGNATORY_ROLE`, `RECEIPT_SIGNATURE_IMAGE`, viz `deploy/README.md`); bez skenu je na potvrzení jen čára se jménem.
- ✅ Potvrzení web vystavuje jen za dary přijaté od 1. 1. 2026 (Jakub 22. 10. 2026). Přehled dárce ukazuje i starší dary, jen u nich není tlačítko pro PDF, a roční potvrzení za dřívější roky stáhnout nejde. Rok je nastavení serveru (`RECEIPT_FIRST_YEAR`, výchozí 2026, viz `deploy/README.md`). ❓ Vystavil fond potvrzení za rok 2025 sám (otázka pro Pavla)? Kdyby je měl vystavit web, nastaví se 2025 a v PR se zároveň upraví zásady ochrany osobních údajů, které mluví o darech od 1. 1. 2026 (viz `deploy/README.md`).

## 5. Příjem a párování darů

- ✅ Dary chodí převodem na účet u **Fio banky**. Web si pohyby stahuje sám přes Fio API (token jen pro čtení; Fio dovolí dotaz nejvýš jednou za 30 s, takže stačí třeba každou hodinu).
- ✅ Historie: první import sáhne tak daleko zpět, jak Fio API dovolí. Starší než 90 dní chce Fio jednorázově odemknout v internetovém bankovnictví (ověřit při zakládání tokenu); co API nedá, lze doplnit z exportu.
- ✅ Párování podle variabilního symbolu dárce; bez VS podle jména a čísla účtu odesílatele. Přesná pravidla doladíme nad skutečnými daty z Fio.
- 🔸 Bezpečné pravidlo pro první verzi: číslo účtu se dárci přiřadí jen z platby, která přišla s jeho VS. Pak se mu spárují i ostatní platby z téhož účtu, starší i budoucí. Dárce si účet do profilu sám nezadává, jinak by kdokoli mohl vidět cizí dary a stáhnout potvrzení na cizí jméno.
- ✅ Bankovní účty dárce (Jakub 18. 10. 2026, varianta A z `parovani-uctu-darce.md`): dárce na nástěnce vidí účty, ze kterých mu přiřazujeme platby bez VS, s počtem a součtem takto přiřazených darů. Další účet přidá tak, že z něj pošle 1 Kč (nebo jakýkoli dar; kvůli otázce na starší VS jen 1 Kč se zprávou Ověření účtu) se svým VS; pak se mu přiřadí i dřívější platby bez VS z toho účtu. U účtu může vypnout párování (tlačítko „Vypnout párování“; Jakub 18. 10. 2026: „Odpojit“ by nepochopil): další platby bez VS z něj se mu už nepřiřazují, dosavadní dary zůstávají; po opětovném zapnutí („Zapnout párování“) se párují jen platby ode dne zapnutí a účet čeká na novou platbu s VS.
- ✅ Jméno majitele účtu se nekontroluje (Jakub 18. 10. 2026): kdo účet prokáže platbou se svým VS, dostane jeho platby, i když banka uvádí jiné jméno. Výjimkou je otázka na starší VS (níže): nedostane ji člověk, jehož účet banka jmenuje jako firmu (s.r.o., a.s., z.s., s.p., p.o., SVJ, společenství vlastníků, společnost, ústav, obec, město a podobně), ani firma, jejíž účet banka jmenuje jinak než firmu.
- ✅ Starší variabilní symbol (Jakub 22. 10. 2026, varianta a′ z `parovani-stary-vs.md`): dlouholetí dárci posílají trvalým příkazem se svým starým VS, který žádný registrovaný dárce nemá, a takové platby zůstávají nespárované. Když dárce ověří účet platbou 1 Kč se zprávou Ověření účtu a z toho účtu do dne ověření přišel právě jeden takový VS, zeptá se ho nástěnka u účtu: „Z tohoto účtu k nám chodí i platby s variabilním symbolem 6123456789 (14 plateb, leden 2025 – říjen 2026). Jsou to dary od vás (Jan Novák)?“ s tlačítky „Ano, jsou moje“ a „Ne, nejsou moje“. Ukazuje VS, počet plateb, které se přiřadí, a měsíce, nikdy částky. Otázka nepřijde, když z účtu do dne ověření přišlo víc takových VS (rodinný nebo sběrný účet) nebo VS registrovaného dárce, když je účet sdílený nebo vyloučený (`PAIRING_EXCLUDED_ACCOUNTS`), ani když jméno z banky nesedí s typem dárce. VS, který z účtu poprvé přišel až po dni ověření, se nenabízí. Po „Ano“ se dárci přiřadí tyto platby hned a každá další s tímto VS z tohoto účtu při importu, stejně jako platby bez VS: jen ve dnech, kdy účet ověřil jen on. Účet se tím nikomu nepřiřazuje. Přehled takový dar označí „VS 6123456789 · …5399/0800“ a u účtu zůstane řádek, že se platby s tímto VS párují. Přibude-li dar do roku, za který si dárce už stáhl roční potvrzení, nástěnka řekne, že se potvrzení změnilo. Obě odpovědi se ukládají s časem a otázka se už nevrátí. Dárce odpověď sám nezmění; omyl opraví správce na stránce „Starší symboly“ (`/sprava/starsi-symboly`, 22. 10. 2026): omylem „Ano“ zruší i s přiřazenými dary, jen dokud na ně neodkazuje vydané potvrzení (odpověď se změní na „Ne“ a dárce se už neptá), omylem „Ne“ smaže, aby se nástěnka zeptala znovu; obojí v auditu. Před nasazením patří do `PAIRING_EXCLUDED_ACCOUNTS` připisovací účty České pošty a vlastní účty fondu. Platí hned po nasazení, bez přepínače; otázku dostanou i účty ověřené dřív.
- 🔸 Účet, u kterého jiný dárce párování vypnul, převezme nový dárce bez jeho historie (platby bez VS až ode dne po vypnutí). Účet, který ověřili dva dárci, je u obou označený jako sdílený a platby bez VS z něj zůstávají nespárované. Nástěnka to u obou ukazuje jako žluté upozornění: kdo z účtu neposílá, má u něj vypnout párování, jinak mají oba posílat s VS. O druhém dárci neříká nic.
- 🔸 Sběrné účty (platební brány, účty, přes které platí víc lidí) jdou vyloučit nastavením serveru `PAIRING_EXCLUDED_ACCOUNTS`; z nich se účet nikdy nenaučí a platby bez VS z nich zůstávají nespárované.
- ✅ Platba, kterou nejde přiřadit, se uloží jako nespárovaná. Správce ji přiřadí ve správě na stránce „Platby z banky“ (`/sprava/platby`, 22. 10. 2026): vidí nespárované platby (datum, částka, odesílatel, VS a zpráva), vyhledá dárce podle jména nebo VS a přiřadí; dar je označen jako přiřazený ručně a zásah se zapíše do auditu. U spárovaných plateb (podle roku) může přiřazení zrušit: dar zmizí z přehledu dárce a platba zůstane mimo automatické párování (s označením „jen ručně“), aby se při dalším stažení z banky nepřiřadila znovu; zrušit nejde dar, ke kterému bylo vystaveno potvrzení o jednotlivém daru. Přibude-li nebo ubude-li dar v roce, za který si dárce už stáhl roční potvrzení, správa to správci řekne, aby dárce upozornil (potvrzení se nahradí při dalším stažení). Ruční přiřazení nenaučí účet odesílatele a nezmění odpovědi na starší VS.
- 🔸 Jak to dělá první verze (k doladění nad daty): VS `0`, který Fio posílá u některých trvalých příkazů, se bere jako platba bez VS a páruje se podle účtu; platba s VS, který žádný dárce nemá, se přiřadí jen přes potvrzení dárce (otázka na starší VS výše), jinak zůstane nespárovaná, i když přišla z už přiřazeného účtu (překlep nesmí skončit jako cizí dar). Jméno odesílatele se k párování nepoužívá, jen číslo účtu; čte ho jen kontrola typu dárce u otázky na starší VS.

## 6. Provoz

- ✅ Zatím na nfnn.znamenacek.duckdns.org (ZimaOS, Nginx Proxy Manager), až bude web hotový, přejde na vlastní doménu **nfnn.cz** (zaregistrovaná 18. 10. 2026 u WEDOS, držitel fond).
- ✅ E-mail fondu `info@nfnn.cz` (příjem funguje od 18. 10. 2026): příchozí pošta se přeposílá přes Cloudflare Email Routing, web odesílá přes Brevo.
- ✅ Fond dostává každý měsíc e-mailem přehled za minulý měsíc (dárci, dary, nespárované platby, stav importu z banky) na `REPORT_RECIPIENT`, výchozí `info@nfnn.cz`. Zároveň tím Brevo neshodí SMTP klíč po 90 dnech bez odeslaného e-mailu. Správa přehledu přijde s administrací.
- ✅ Základ administrace (Jakub 22. 10. 2026): správce je dárcovský účet s rolí `ADMIN`. Jakub 22. 10. 2026: nic ve správě se nedělá SQL na serveru, všechno musí jít v GUI. Roli dává a odebírá jiný správce na stránce „Správci“ (`/sprava/spravci`): přidá registrovaného dárce podle e-mailu, odebere správce (ne sebe; dotyčnému skončí všechna přihlášení) a vypne dárci dvoufaktorové ověření po ztrátě telefonu (po ověření, že žádá majitel účtu; dotyčný dostane e-mail a přihlásí se jen heslem, než si ho zapne znovu); vše v auditu. Prvního správce určí řádek `ADMIN_EMAILS` v `backend.env` (backend mu roli dá při startu); žádná registrace správce přes web; správa je na `/sprava` (odkaz „Správa“ v hlavičce přehledu vidí jen správce) a zatím ukazuje stav stahování plateb z banky; každý zásah správce se od prvního zápisu ukládá do tabulky `admin_action` (kdo, kdy, co) a stránka „Historie správy“ (`/sprava/historie`, 22. 10. 2026) ji ukazuje nejnovější nahoře po 50 záznamech, i se jmény bývalých správců. Správa je dostupná z internetu a správce se přihlašuje s dvoufaktorovým ověřením (rozhodnuto 22. 10. 2026): jednorázový kód z ověřovací aplikace v telefonu (TOTP, např. Google Authenticator, Microsoft Authenticator, Aegis). Dvoufaktorové ověření (v UI „dvoufaktorové ověření“, Jakub 22. 10. 2026; dřív „druhý faktor“) si může zapnout každý dárce na kartě „Přihlašovací údaje“ (heslo → QR kód a klíč pro aplikaci → první kód ho zapne; vypnutí chce heslo a kód; obojí ukončí ostatní přihlášení); správce ho mít musí, jinak se přihlásí jen jako dárce a správa mu zůstane zavřená (přehled mu to napíše). Výchozí volby Claude, Jakub je zatím neschválil jednotlivě: kód platí 30 s s tolerancí jednoho kroku a každý jen jednou, po správném hesle má dárce 5 minut a 5 pokusů na kód, žádné záložní kódy (ztracenou aplikaci vypne jiný správce na stránce „Správci“ nebo na kartě dárce), žádný e-mail o zapnutí či vypnutí dárcem samým (jen o vypnutí správcem).
- ✅ Dárci ve správě (23. 10. 2026, úkol 7a plánu v2): stránka „Dárci“ (`/sprava/darci`) hledá dárce podle části jména nebo e-mailu nebo začátku variabilního symbolu (nejvýše 20 výsledků) a karta dárce (`/sprava/darci/{id}`) ukazuje jeho účet (typ, e-mail a jeho ověření, adresa, VS, jazyk, registrace, role, dvoufaktorové ověření), bankovní účty, všechny dary a všechna vydaná potvrzení. Správce na ní vypne dárci dvoufaktorové ověření, vypne a zapne párování z účtu (totéž, co dárce sám) a odebere účet, který se dárci přiřadil omylem: dary spárované přes něj a odpovědi dárce o starších symbolech u toho účtu se smažou a platby jsou zase nespárované; odebrání se odmítne, dokud některý z těch darů kryje vydané potvrzení. Správce dárci nic neupravuje (jméno, adresu, e-mail a heslo si mění dárce sám). Výchozí volby Claude, Jakub je zatím neschválil jednotlivě: limit 20 výsledků, hledání bez diakritiky se neřeší (hledá se přesná část textu), odebrání účtu maže i odpovědi o starších symbolech. Výmaz dárce (GDPR) je úkol 7b.
- 🔸 Angular + Spring Boot + PostgreSQL podle repa `bzumik1/nfnn`. Čeština; angličtina připravená na později.
- 🔸 Zprávy z kontaktního formuláře web smaže ze své databáze rok po odeslání (každý den ve 3:30). Kopii ve schránce fondu web smazat neumí; zásady slibují, že ji fond drží jen do vyřízení dotazu.
- 🔸 Zásady ochrany osobních údajů popisují, co web skutečně dělá: párování podle VS i podle prokázaného účtu, uložené údaje z výpisu (i konstantní a specifický symbol a zprávu pro příjemce), IP adresy v limitech a v logu reverzní proxy a webového serveru, Brevo (měří otevření a kliky), Cloudflare a Gmail včetně předání do USA a zálohy. Platí od 18. 10. 2026 a web běží na vlastním serveru fondu (obojí potvrdil Jakub 18. 10. 2026). ❓ Zbývá zjistit, jak dlouho drží Nginx Proxy Manager své logy; zásady zatím říkají „do jejich automatického smazání“.

- 🔸 Hlídání výpadku zvenčí (kontrola dostupnosti webu a endpointu, který prokáže backend), zkušební obnova zálohy a kopie záloh mimo server přijdou po přechodu na nfnn.cz (Jakub 22. 10. 2026).

## 7. Později, mimo první verzi

- Administrace pro správce (aktuality, projekty, nespárované platby, nastavení měsíčního přehledu: komu chodí, kdy a co obsahuje). Základ (role, `/sprava`, audit, stav importu) je hotový, viz §6; části přibývají po jedné.
- Přístup Clauda k logům na serveru a MCP server pro NFNN: nejdřív čtení (logy, stav importu, počty darů) z chatu na claude.ai, později zápis jako náhrada části administrace. Rozbor a pořadí jsou v plánu úkolů (úkoly 10 a 11).
- Posílání potvrzení e-mailem.
- Smazání účtu dárcem.
- Platba kartou online.
- Samostatné stránky projektů, aktualit, dokumentů.
- Angličtina.
- Rozšíření přehledu dárce.
- Změna odpovědi na otázku na starší VS dárcem samým.
- Účty, ze kterých chodí víc starších VS, v měsíčním přehledu.

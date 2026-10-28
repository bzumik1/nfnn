# Roadmapa

Co web umí po verzích a co čeká v zásobníku. Verze je ucelený blok práce, aplikace sama číslo verze nenese (nasazuje se podle commitu). Podrobnosti hotových funkcí jsou v `requirements.md` (rozhodnutí klienta) a v přehledech `system-overview.md`, `frontend-overview.md` a `security-overview.md`.

Udržuje se v každém PR, který funkci dokončí nebo o ní rozhodne: funkce se přesune z backlogu do verze, nebo mezi částmi backlogu. Další verzi vybere Jakub z části „Schváleno“; do té doby žádná plánovaná verze není.

## v1: hotovo (17.–22. 10. 2026)

Veřejný web a účet dárce.

- Úvodní stránka podle prototypu, kontaktní formulář, zásady ochrany osobních údajů.
- Přispět: QR platba s částkou, přihlášenému dárci s jeho variabilním symbolem.
- Účet dárce: registrace (člověk i firma), přihlášení, obnova hesla, vlastní variabilní symbol, přehled darů po letech.
- Import plateb z Fio API každou hodinu a párování podle VS, podle ověřeného účtu dárce (platba 1 Kč) a podle staršího VS, na který se dárce přihlásí.
- Bankovní účty dárce: přidání ověřovací platbou, vypnutí a zapnutí párování, vyloučené sběrné účty.
- Roční potvrzení o daru v PDF (šablona a data, deterministické vykreslení, číslování), volitelně i za jednotlivý dar.
- Měsíční přehled e-mailem, nasazení na ZimaOS, denní zálohy databáze.

## v2: aktuální (od 22. 10. 2026)

Účet a e-maily, administrace, konektor pro Clauda a spuštění na nfnn.cz.

Hotovo:

- Jednotný vzhled e-mailů, ověření e-mailu při registraci a jedna připomínka, změna e-mailu a hesla, bezpečnostní e-maily k účtu.
- Druhý faktor (TOTP), přihlášení přístupovým klíčem i účet jen s klíči, vypnutí druhého faktoru platbou 1 Kč, odmítání běžných hesel.
- Administrace `/sprava` s postranním panelem: nespárované platby a ruční párování, dárci a karta dárce, výmaz podle GDPR, správci (role jen z GUI), starší symboly, historie změn, přehledy a nastavení měsíčního přehledu, aktuality a projekty s fotkami a vlastními stránkami, nastavení serveru, podpis potvrzení, zálohy s plánem, zkušební obnovou a obnovou v prohlížeči, logy a diagnostika.
- E-mail při výpadku importu a při problému se zálohou.
- Konektor MCP pro claude.ai a Claude Code: připojení aplikací přes `/pripojeni`, nástroj pro každé čtení a každou vratnou změnu správy; nevratné akce jen na webu.
- První nastavení serveru v prohlížeči místo env souborů.
- Bezpečnostní audit (vlastní databázová role, zpevněné kontejnery, jedna síť `nfnn-edge`), přístupnost (klávesnice, čtečky, zvětšení), vyměnitelný vzhled (theme), audit použitelnosti celého webu.

Rozpracováno (audit přehlednosti, rozhodnuto 24. 10. 2026):

- Zkušební e-mail z nastavení pošty a nastavení seřazené podle četnosti, technická část sbalená.
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
- Provozní kroky Jakuba z bezpečnostního auditu (seznam je mimo veřejné repo).
- Přechod na doménu nfnn.cz (postup v `deploy/README.md`).
- Kopie záloh mimo server a hlídání dostupnosti zvenčí.
- Odemčení historie ve Fio a hluboký import, aby potvrzení za rok 2026 obsahovala všechny dary.
- Zátěžová zkouška vydávání potvrzení před Novým rokem.

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

Veřejný web a provoz:

- Tlačítko Sdílet u aktualit a projektů (Web Share API, kopírování odkazu).
- Chyby z prohlížeče do logu, bez osobních údajů.
- Jedna hláška „Web se právě aktualizuje“ při restartu serveru.
- E-mail při docházejícím místě na disku.
- Smazání registrací, které nikdo nepotvrdil do 30 dnů.

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
- Strukturovaná data fondu pro vyhledávače (`Organization`, IČO, účet).
- Znovu provést výmazy podle GDPR po obnově ze zálohy pořízené před nimi.
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

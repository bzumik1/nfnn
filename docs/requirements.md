# Zadání: web Nadačního fondu Nová naděje

Co web dělá a co o něm rozhodl klient (Jakub, za fond se ptá Pavla). Popisuje web tak, jak má fungovat, ne jak je postavený: jak to funguje uvnitř, je v `system-overview.md`, zabezpečení v `security-overview.md`, stránky v `frontend-overview.md`, rozhraní v `api-contract.md` a server v `deploy/README.md`. Co přijde dál, je v `roadmap.md`.

Rozhodnutí vznikla v rozhovorech s Jakubem od 17. 10. 2026; výchozí volby, které navrhl Claude, prošel Jakub 23. 10. 2026 jednu po druhé a potvrdil nebo změnil. Kdy a proč se co rozhodlo, ukáže historie tohoto souboru. Nové rozhodnutí se zapíše sem ve stejném PR, který ho staví.

## 1. Cíl

Web představí fond a jeho pomoc dětem, usnadní darování a dárcům dá účet s přehledem darů po letech a s ročním potvrzením o daru ke stažení. Fond ho spravuje sám, bez programátora.

## 2. Kdo web používá

- **Návštěvník** čte o fondu, napíše přes kontaktní formulář a přispěje převodem.
- **Dárce**, člověk i firma (stovky darů ročně), má účet, vidí své dary a stahuje potvrzení.
- **Správce** je netechnický člověk s dárcovským účtem a rolí správce. Všechno dělá ve správě v prohlížeči.
- **Připojená aplikace** (Claude na claude.ai nebo v Claude Code) jedná jménem správce, který ji připojil, a smí jen to, co jí správce povolil.

## 3. Veřejný web

- Sekce úvodní stránky: Domů, O nás, čísla, Projekty, Aktuality, Přispět, Kontakt (formulář) a patička s IČO a zápisem v rejstříku. Vzhled vychází z původního prototypu (modrý akcent, hero přes celou obrazovku, zaoblené karty).
- O nás říká i to, kdo fond vede dnes: portrét a jméno předsedy správní rady, celou správní radu podle rejstříku (revizora ne, Jakub 30. 10. 2026). Kontakt má jednu kartu „Údaje pro účetní“ (název, IČO, sídlo, zápis v rejstříku, číslo účtu a IBAN, s tlačítky Kopírovat) a každý údaj v Kontaktu jen jednou (Jakub 30. 10. 2026 po uživatelských testech: sponzor nenašel, kdo fond vede, a údaje pro účetní byly roztroušené).
- Fotka v O nás se nahrává ve správě (`/sprava/o-nas`), ne do veřejného kódu webu, protože zobrazuje dítě (Jakub 30. 10. 2026): je uložená v databázi jako fotky aktualit, má popis pro čtečky a popisek pod fotkou, oba nepovinné, a ukáže se celá, na výšku i na šířku. Správce ji může kdykoli odebrat; smazáním zmizí z webu, ze záloh do 30 dnů; stažená záloha ji drží dál a obnova ze zálohy starší než odebrání ji na web vrátí (pak ji správce odebere znovu). Dokud žádná není, zůstává ilustrační fotka.
- Vzhled je vyměnitelné téma oddělené od chování: nové téma změní celý web bez zásahu do stránek.
- **Přispět**: návštěvník zvolí částku (100 / 500 / 1 000 / jiná) a dostane QR platbu na účet fondu. Přihlášenému dárci nese QR jeho variabilní symbol, takže se dar spáruje sám.
- Aktuality a projekty píše správce. Úvodní stránka ukazuje tři nejnovější z každých, každá má svou stránku a obojí má seznam po deseti. Dokud žádné nejsou zveřejněné, zůstávají zástupné karty.
- Stránka Zásady ochrany osobních údajů popisuje, co web skutečně dělá (viz §8).
- Adresy, které vidí návštěvník, jsou české bez diakritiky (`/darce/prehled`, `/sprava`).
- Přístupnost podle WCAG 2.2 AA (klávesnice, čtečky, zvětšení, nastavení systému), aniž by se měnil výchozí vzhled; viditelná změna kvůli přístupnosti potřebuje Jakubův souhlas.
- Texty, příběhy, čísla a fotky jsou zatím zástupné; skutečné dodají Jakub a Pavel.

## 4. Účet dárce

### Registrace a přihlášení

- Hlavička webu nabízí nepřihlášenému návštěvníkovi vedle „Přihlásit se“ i „Založit účet“, na počítači i v menu na telefonu (Jakub 30. 10. 2026, po třetím kole uživatelských testů).
- Přepínač „člověk / firma“. Člověk zadá jméno, adresu a e-mail, firma název, IČO, sídlo a e-mail. Adresa a IČO jsou povinné hned, protože patří na potvrzení.
- Firma vyplní nejdřív IČO a web po zadání platného IČO doplní z obchodního rejstříku (ARES) název a sídlo do prázdných polí, dárce je jen zkontroluje. Když ARES nefunguje nebo IČO nezná, formulář se chová jako dřív a dárce nic nepozná, web jen zaloguje varování; na ARES tak nejsme závislí (Jakub 24. 10. 2026).
- Dárce se přihlašuje heslem, nebo přístupovým klíčem (passkey). Účet může mít jen klíč a žádné heslo; poslední způsob přihlášení odebrat nejde.
- Registraci dárce potvrdí odkazem z e-mailu (platí 24 hodin). Do té doby se nepřihlásí a platby se k jeho symbolu nepárují. Kdo nepotvrdí do druhého dne, dostane jednou připomínku. Registrace stejného e-mailu nic neprozradí: majitel potvrzeného účtu dostane e-mail, že účet už má.
- Po registraci dostane dárce vlastní variabilní symbol, který vidí v přehledu.
- Kdo se zaregistruje ze sekce Přispět, je po potvrzení e-mailu přihlášený a tlačítko „Pokračovat k příspěvku“ ho vrátí na `/#prispet`, kde QR už nese jeho symbol; registrace odjinud vede do přehledu (Jakub 24. 10. 2026).
- Po přihlášení dárce zůstane na stránce, odkud se přihlásil. Jen když přihlášení vyvolala chráněná stránka, vrátí se na ni; ze stránky obnovy hesla vede do přehledu.
- Účet si dárce sám smazat nemůže. Výmaz podle GDPR vyřídí na žádost správce (§6).

### Zabezpečení účtu

- Heslo a e-mail se mění jen se současným heslem (nebo klíčem). Nový e-mail se potvrdí z nové adresy a stará adresa dostane oznámení. Po změně hesla dostane dárce e-mail.
- Na stránce Údaje a zabezpečení je všechno k přihlášení v jedné kartě „Přihlášení a zabezpečení“: řádky E-mail, Heslo, Dvoufaktorové ověření a Přístupové klíče, každý se stavem a jednou akcí, formulář se otevře pod řádkem. Rozpracovaná změna e-mailu je vidět („Čeká na potvrzení: adresa“) a jde poslat znovu (starý odkaz přestane platit) nebo zrušit (Jakub 24. 10. 2026).
- Dvoufaktorové ověření kódem z aplikace v telefonu si může zapnout každý dárce; správce ho mít musí (nebo se přihlásit klíčem, který platí jako druhý faktor). Záložní kódy nejsou (Jakub 29. 10. 2026); před zapnutím se dárce dočte, že ztracený telefon nahradí platba 1 Kč z účtu ověřeného aspoň týden, dřív jen správce.
- Ztracený telefon: jiný správce ověření vypne, nebo ho dárce vypne sám platbou 1 Kč s jednorázovým kódem z bankovního účtu, který má u fondu ověřený aspoň 7 dní. Ztracené klíče odebere správce.
- Kdo obnovu platbou zahájí znovu, dokud předchozí platí, dostane stejný kód a platnost s větou „Tuto obnovu už jste zahájili …“; obnova ukazuje i QR platbu 1 Kč se zprávou OBNOVA … bez VS (Jakub 24. 10. 2026, kód se proto ukládá i čitelně).
- Přístupové klíče přidá dárce v přehledu (se současným heslem nebo klíčem), přejmenuje a odebere; o přidání i odebrání dostane e-mail; nejvýš 10. Klíče ze zkušební adresy se po přechodu na nfnn.cz smažou samy.
- Bezpečnostní e-maily k účtu (ověření, obnova, změna e-mailu, hesla, klíče nebo druhého faktoru) chodí vždy.

### Přehled

- Celkem darováno, počet darů, poslední dar, tabulka plateb a souhrn po letech (rok, počet darů, částka).
- Moje dary jsou seskupené po letech od nejnovějšího, každý rok s počtem darů, částkou a tlačítkem na roční potvrzení, jakmile je k dispozici (Jakub 24. 10. 2026).
- Můj přehled má kartu „Poslat dar“ se stejnou volbou částky, číslem účtu, variabilním symbolem, IBAN a QR jako sekce Přispět a s návodem na trvalý příkaz; dárce kvůli číslu účtu nechodí na hlavní stránku (Jakub 29. 10. 2026).
- Částky v přehledu, v Moje dary, v potvrzeních a v platbách a kartě dárce ve správě jsou tučné v barvě textu; modrá zůstává odkazům a tlačítkům (Jakub 29. 10. 2026).
- Bankovní účty, ze kterých se dárci přiřazují platby bez symbolu (§5), s počtem a součtem darů z každého.

### Potvrzení o daru

- Hlavně roční potvrzení jako PDF ke stažení po skončení roku; nic se neposílá, dárce si ho stáhne, když potřebuje. Navíc potvrzení k jednotlivému daru.
- Stránka Potvrzení o daru nabízí kromě ročních potvrzení i potvrzení k jednotlivým letošním darům; Moje dary je mají u každého daru dál (Jakub 30. 10. 2026).
- Obsah: údaje fondu, údaje dárce, dary s datem a částkou, celková částka, účel, datum vystavení a číslo potvrzení.
- Podepisuje Pavel Znamenáček, předseda správní rady. Jméno, funkci a podpis mění správce ve správě; podpis nejlépe jako vektor SVG složený jen z vyplněných tvarů (Jakub 2026-10-30: „Chtěl bych všude používat podpis jako SVG“), sken JPEG, PNG nebo WebP zůstává jako záloha; bez razítka (zákon ho nevyžaduje). Bez nahraného podpisu je na potvrzení čára se jménem.
- Vystavené potvrzení se nemění. Změní-li se potvrzované údaje (pozdě spárovaný dar, nové jméno nebo adresa), další stažení vystaví náhradní potvrzení s novým číslem, které uvádí, co nahrazuje. Jazyk podle dárce; anglické potvrzení je dvojjazyčné.
- Web vystavuje potvrzení jen za dary od 1. 1. 2026. Starší dary přehled ukazuje, jen bez PDF.

## 5. Příjem a párování darů

- Dary chodí převodem na účet u Fio banky. Web si pohyby stahuje sám každou hodinu, tokenem jen pro čtení; první import sáhne tak daleko zpět, jak Fio dovolí.
- Párování podle variabilního symbolu dárce. Symbol `0` znamená platbu bez symbolu. Když pole symbolu chybí a ve zprávě pro příjemce je právě jeden symbol některého dárce, platba patří jemu, i u ověření účtu platbou 1 Kč (Jakub 29. 10. 2026: některé banky pole symbolu nemají).
- Platba bez symbolu se přiřadí podle čísla účtu odesílatele, ale jen z účtu, který dárce prokázal platbou se svým symbolem. Dárce si účet do profilu sám nezadává, jinak by kdokoli viděl cizí dary. Další účet prokáže platbou 1 Kč se svým symbolem; pak se mu přiřadí i dřívější platby z něj.
- Jméno majitele účtu se nekontroluje: kdo účet prokáže, dostane jeho platby.
- Párování z účtu může dárce i správce vypnout; dosavadní dary zůstávají a po zapnutí se párují jen nové platby. Účet, který prokázali dva dárci, je sdílený a platby bez symbolu z něj zůstávají nespárované; o druhém dárci web nic neříká.
- Sběrné účty (platební brány, účty fondu, Česká pošta) správce vyloučí z párování v nastavení.
- Platba s neznámým symbolem zůstane nespárovaná, i když přišla ze známého účtu: překlep nesmí skončit jako cizí dar.
- **Starší variabilní symbol**: dlouholetí dárci posílají se starým symbolem, který nikdo z registrovaných nemá. Když dárce prokáže účet platbou 1 Kč se zprávou „Ověření účtu“ a z toho účtu chodil právě jeden takový symbol, přehled se ho zeptá, jestli jsou to jeho dary (symbol, počet plateb a měsíce, nikdy částky). Po „Ano“ se mu tyto platby přiřadí i do budoucna. Otázka nepřijde u rodinných, sdílených nebo vyloučených účtů ani když jméno z banky neodpovídá typu dárce (firma a člověk). Odpověď dárce sám nezmění, omyl opraví správce.
- Platba 1 Kč se zprávou „Ověření účtu“ je „Ověření účtu“, ostatní „Obecný příspěvek“. Přehled a Moje dary ji ukazují jako „Ověření účtu“ s částkou, méně výrazně než dary; nikdy není „Poslední dar“ (dárce, který poslal jen ověření, ještě dar nemá) a nemá vlastní potvrzení o jednotlivém daru. Do ročních součtů a ročního potvrzení se dál počítá (Jakub 29. 10. 2026; dříve, 18. 10., byla obyčejným darem s vlastním potvrzením).
- Co nejde přiřadit, přiřadí ručně správce. Ruční přiřazení nenaučí účet odesílatele a zrušené přiřazení se při dalším stažení samo nevrátí. Dar, ke kterému je vydané potvrzení o jednotlivém daru, odpárovat nejde; změna roku, za který už dárce stáhl roční potvrzení, se správci ohlásí.

## 6. Správa

- Všechno, co správa potřebuje, jde v prohlížeči na `/sprava`; nic se nedělá SQL ani zásahem na serveru.
- Každé datum, lhůta a čas funkce je nastavení ve správě s výchozí hodnotou, a každý automatický e-mail jde ve správě vypnout (upozornění na poruchy s varováním, bezpečnostní e-maily nikdy). U stávajících funkcí se to doplňuje postupně (`roadmap.md`).
- Menu podle toho, jak často se stránky používají: Přehled; Každý den (Platby z banky, Dárci, Aktuality, Projekty); Občas (Správci, Měsíční e-mail, Zálohy, Historie změn); Pro technika (Nastavení, Logy a diagnostika, Odpovědi o starších symbolech).
- **Přehled**: dary a dárci za rok po měsících: počet a součet všech přijatých plateb, kolik různých dárců v měsíci poslalo dar (sloupec „Dárci“; platby bez dárce se nepočítají), noví dárci (registrace), kolik je spárovaných a kolik ne.
- **Od posledního přihlášení** (Jakub 29. 10. 2026, po uživatelských testech, „Obojí“: tento blok i sloupec „Dárci“): nahoře na přehledu správy, co přibylo od předchozího přihlášení správce do správy: nové platby z banky (počet a součet), kolik z nich je přiřazených a kolik čeká na přiřazení, a noví registrovaní dárci; každé číslo vede na svou stránku (Platby z banky s datem od přihlášení, Dárci) a blok uvádí, kdy přihlášení bylo. Bez předchozího přihlášení nebo když nic nepřibylo, řekne to jednou větou. Web si pamatuje jen poslední dvě přihlášení správců (u dárců nic) a každý správce vidí jen svoje; obnovení přihlášení se nepočítá. Konektor totéž čte nástrojem. Zatím to počítá server; verze z dat v zařízení s vydanými potvrzeními a zásahy jiných správců zůstává v roadmapě.
- **Správci**: roli dává a bere jen jiný správce, a jen účtu s potvrzeným e-mailem; sám sobě nikdo. Prvního správce určí e-mail z prvního nastavení. Správce na žádost majitele vypne dvoufaktorové ověření nebo odebere klíče.
- **Dárci**: hledání podle jména, e-mailu nebo symbolu (bez ohledu na diakritiku), karta dárce s účtem, bankovními účty, dary a potvrzeními. Správce dárci údaje nemění. Odebere účet přiřazený omylem, dokud jeho dary nekryje vydané potvrzení.
- **Výmaz podle GDPR** na kartě dárce: jméno, adresa, e-mail a přihlašovací údaje se nahradí zástupnými, dary a vydaná potvrzení zůstávají kvůli účetnictví, symbol se už nepáruje a dárce dostane e-mail. Výmaz je nevratný; správce vymazat nejde.
- **Platby z banky**: nespárované platby s hledáním dárce a ručním přiřazením, spárované se zrušením přiřazení. Jedno pole hledá podle jména odesílatele, účtu, symbolu, zprávy i částky, „Od“ a „Do“ omezí datum, přiřazené se načítají po 50 („Načíst další“); hledání i karta jsou v adrese stránky. Karta dárce odkazuje na jeho platby (Jakub 24. 10. 2026).
- **Aktuality a projekty**: titulek, adresa, štítek, perex, text v Markdownu s náhledem a jedna fotka s popisem pro nevidomé. Koncept vidí jen správce; zveřejnění s datem (i zpětně nebo dopředu), stažení z webu a smazání po potvrzení. Projekt má navíc rok, podle kterého se řadí. Stará adresa po přejmenování vede dál na novou.
- Editor aktualit a projektů je jeden formulář s přepínačem „Upravit / Náhled“ (náhled ukáže neuložené hodnoty jako veřejný web: kartu i celou stránku) a lištou akcí u spodního okraje: u konceptu „Uložit koncept“ a „Uložit a zveřejnit“, u zveřejněné „Uložit a ukázat na webu“, „Stáhnout z webu“ a „Otevřít na webu“. Zda je položka na webu, nebo se zveřejní později, určuje server podle dnešního data v Praze, ne hodiny v prohlížeči (Jakub 24. 10. 2026).
- **Měsíční e-mail**: přehled za minulý měsíc (dárci, dary včetně nespárovaných, platby bez dárce, stav stahování z banky). Správce nastaví příjemce, den, hodinu a části a pošle kterýkoli skončený měsíc znovu. Zároveň udržuje naživu klíč k odesílání pošty.
- **Zálohy**: každou noc a při každém startu, 30 dní zpět; jednou týdně zkušební obnova. Správce vidí stav, spustí zálohu nebo zkušební obnovu hned, nastaví časy, zálohu stáhne a kteroukoli obnoví (před obnovou se udělá záloha, nepovedená obnova nechá data, jak byla). Nová instalace se dá obnovit ze zálohy v prvním nastavení.
- **Šifrované zálohy** (Jakub 28. 10. 2026): každá záloha je zašifrovaná klíčem k zálohám, který si server vygeneruje sám a drží ho. Klíč se ukazuje jen jako 24 českých slov (Jakub 29. 10. 2026), která se dobře opisují na papír nebo kopírují do správce hesel; obnova je přijme stejně jako klíč a soubor ke stažení nese obě podoby. Ověření je samostatný krok: po „Mám uloženo, ověřit“ slova zmizí a server se zeptá na tři náhodná, takže se opisují z uložené kopie, ne z obrazovky. Průvodce prvním nastavením klíč ukáže a pokračuje až po tomto ověření; ve správě na stránce Zálohy jde klíč zobrazit jen z prohlížeče, pokaždé s novým kódem nebo přístupovým klíčem (má-li ho správce, nabídne se nejdřív přístupový klíč a kód až na vyžádání, Jakub 29. 10. 2026; stejně při povolení připojené aplikace), a každé zobrazení je v historii změn a přijde o něm e-mail všem správcům; nesouhlasící kód je v historii taky a po pěti za čtvrt hodinu se klíč tomu správci čtvrt hodiny neukáže (bezpečnostní revize 29. 10. 2026). Dokud nikdo nepotvrdí, že si klíč uložil (opsáním tří slov, na která se server zeptá), správa na to upozorňuje. Obnova na novém serveru chce zálohu a klíč starého serveru, který nový server převezme. Záloha nese i heslo k poště a token Fio, zamčené klíčem k zálohám (Jakub 29. 10. 2026), takže po obnově na jiném serveru fungují hned.
- **Upozornění e-mailem** příjemcům měsíčního e-mailu: porucha stahování z banky (třikrát za sebou nebo odmítnutý token) a chybějící, nepovedená nebo stará záloha či zkušební obnova (26 hodin, 8 dní). Jednou za poruchu a jednou, až zase funguje.
- **Historie změn**: každý zásah správce i připojené aplikace jako česká věta se jménem dárce a částkou v korunách (i starší záznamy), s tím, kdo a kdy; id jsou v rozbalovacích podrobnostech a dárce je odkaz na kartu. Filtr zatím není (Jakub 24. 10. 2026).
- **Nastavení**: nahoře to, co se mění častěji (potvrzení o daru a podpis, kontaktní formulář, odesílatel e-mailů), dole sbalené „Technické nastavení (pro správce serveru)“ s varováním (adresa webu, pošta, banka, vyloučené účty a další hodnoty serveru); ukládá se jedním tlačítkem. Hesla a tokeny mění jen správce v prohlížeči. Před uložením pošty jde tady i v prvním nastavení poslat skutečný zkušební e-mail s údaji z formuláře (na adresu přihlášeného správce, v prvním nastavení prvnímu správci); výsledek řekne, kam odešel, nebo lidsky, co je špatně. Uložit jde i bez zkoušky, jen s varováním (Jakub 24. 10. 2026).
- **Logy a diagnostika**: logy serveru, úrovně logování a diagnostika. Logy nesou jen identifikátory a výsledky, ne jména, adresy ani tokeny.
- **První nastavení** po instalaci: průvodce v prohlížeči, bez úprav souborů na serveru. Klíče si server vygeneruje sám. Z domácí sítě se otevře bez kódu, odjinud s kódem z výpisu kontejneru.

## 7. Konektor pro AI

- Správce připojí Clauda (claude.ai nebo Claude Code) ke správě: přihlásí se s druhým faktorem a připojení povolí (vždy s čerstvým kódem nebo klíčem). Připojit se smí jakákoli aplikace s jeho souhlasem; registrovat ji nikde netřeba.
- Konektor smí číst všechno ze správy a dělat každou vratnou změnu (nastavení, report, obsah včetně fotek, párování, odpojení a připojení účtu, úrovně logů, zálohy na vyžádání). Každá akce je v historii změn pod jménem správce a s názvem aplikace.
- Jen na webu zůstává, co je nebezpečné nebo nevratné: mazání, výmaz dárce, role správce, reset druhého faktoru a klíčů, oprava odpovědi o starším symbolu, stažení a obnova zálohy, zobrazení klíče k zálohám, hesla, tokeny a adresa webu, podpis potvrzení a schválení připojení.
- Povolení platí 14 dní od posledního použití; připojené aplikace správce vidí a odpojí v přehledu. Připojení skončí i s rolí správce.

## 8. Provoz a ochrana údajů

- Web běží na vlastním serveru fondu (ZimaOS). Zatím na zkušební adrese, po dokončení na **nfnn.cz** (registrovaná 18. 10. 2026, držitel fond). Nasazení nové verze dělá Jakub ručně.
- E-mail fondu `info@nfnn.cz`: příchozí pošta se přeposílá, web odesílá přes Brevo.
- Web sbírá jen to, co potvrzení a párování potřebují. Zprávy z kontaktního formuláře maže rok po odeslání; kopii ve schránce fondu drží fond jen do vyřízení.
- Zásady ochrany osobních údajů popisují párování podle symbolu i účtu, uložené údaje z výpisu, IP adresy v limitech a logech, Brevo (měří otevření a kliky), Cloudflare, Gmail včetně předání do USA a zálohy. Platí od 18. 10. 2026 a mění se s každou funkcí, která mění údaje.
- Co jde udělat v prohlížeči, dělá prohlížeč (local first, Jakub 28. 10. 2026): QR kód platby i PDF potvrzení bude prohlížeč vytvářet sám a web i nainstalovaná aplikace půjdou používat i offline: data dárce i správy zůstanou v zařízení natrvalo, šifrovaná a čitelná jen po přihlášení, bez připojení jen k prohlížení (`roadmap.md`). Potvrzení ponesou ověřovací QR podepsaný fondem s tím, co je na papíře; kdokoli ho ověří fotoaparátem telefonu i bez účtu. Fotky k obsahu zatím zpracovává server. Server přihlašuje, vydává čísla potvrzení, páruje dary, importuje z Fio, posílá e-maily, počítá přehledy správy a slouží konektoru.
- Čeština; angličtina je připravená na později.

## 9. Otevřené otázky

- Vystavil fond potvrzení za rok 2025 sám (otázka pro Pavla)? Pokud ne, web je může vystavit i za 2025 a zásady ochrany údajů se upraví.
- Jak dlouho drží Nginx Proxy Manager své logy; zásady zatím říkají „do jejich automatického smazání“.
- Další otázky pro Pavla a kroky před spuštěním jsou v `roadmap.md`.

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

- ✅ Vzhled a sekce podle prototypu `Claude Design/Nova Nadeje.html` (modrý akcent, fullscreen hero, zaoblené karty): Domů, O nás, čísla, Projekty (karty dětí), Aktuality, Přispět, Kontakt (formulář), patička s IČO a zápisem v rejstříku.
- ✅ Texty, příběhy, čísla, fotky a údaje fondu (účet, IČO, adresa) jsou v prototypu zástupné. Skutečné dodá Jakub.
- ✅ **Přispět**: návštěvník zvolí částku (100 / 500 / 1000 / jiná) a vygeneruje se QR platba na účet fondu. Přihlášenému dárci QR obsahuje jeho variabilní symbol, takže se dar spáruje sám.
- 🔸 K tomu jen stránka **Zásady ochrany osobních údajů**, nutná kvůli registraci. Další stránky (detaily projektů a aktualit, dokumenty) až postupně ✅.

## 4. Stránka pro dárce

### Registrace a přihlášení
- ✅ Přepínač „člověk / firma“. Člověk: jméno, adresa, e-mail, heslo. Firma: název, IČO, sídlo, e-mail, heslo. Adresa a IČO jsou povinné hned, protože patří na potvrzení.
- 🔸 Přihlášení e-mailem a heslem, obnova hesla e-mailem (jako v prototypu).
- 🔸 Po registraci dostane dárce vlastní variabilní symbol, který vidí v přehledu.
- ✅ Účet si dárce sám smazat nemůže; přidá se později. 🔸 Žádost o výmaz podle GDPR zatím vyřídí fond ručně (e-mailem); záznamy o darech zůstávají kvůli účetnictví.

### Přehled
- ✅ Jako v prototypu: celkem darováno, počet darů, poslední dar, tabulka plateb.
- ✅ Navíc souhrn po letech: rok, počet darů, částka.

### Potvrzení o daru
- ✅ Hlavně **roční potvrzení**, ke stažení po skončení roku jako PDF. Nic se neposílá, dárce si ho stáhne, když potřebuje.
- ✅ Potvrzení k jednotlivému daru navíc, pokud nebude složité (je to stejná šablona s jedním řádkem).
- 🔸 Obsah: údaje fondu (název, IČO, sídlo), údaje dárce, seznam darů s datem a částkou, celková částka, účel, datum vystavení, číslo potvrzení.
- 🔸 Podpis: jméno a funkce podepisujícího a naskenovaný podpis jako obrázek, který jde vyměnit bez úpravy kódu. Bez razítka (zákon formu nepředepisuje, razítko nemá právní váhu).
- ❓ Kdo za fond podepisuje.

## 5. Příjem a párování darů

- ✅ Dary chodí převodem na účet u **Fio banky**. Web si pohyby stahuje sám přes Fio API (token jen pro čtení; Fio dovolí dotaz nejvýš jednou za 30 s, takže stačí třeba každou hodinu).
- ✅ Historie: první import sáhne tak daleko zpět, jak Fio API dovolí. Starší než 90 dní chce Fio jednorázově odemknout v internetovém bankovnictví (ověřit při zakládání tokenu); co API nedá, lze doplnit z exportu.
- ✅ Párování podle variabilního symbolu dárce; bez VS podle jména a čísla účtu odesílatele. Přesná pravidla doladíme nad skutečnými daty z Fio.
- 🔸 Bezpečné pravidlo pro první verzi: číslo účtu se dárci přiřadí jen z platby, která přišla s jeho VS. Pak se mu spárují i ostatní platby z téhož účtu, starší i budoucí. Dárce si účet do profilu sám nezadává, jinak by kdokoli mohl vidět cizí dary a stáhnout potvrzení na cizí jméno.
- 🔸 Platba, kterou nejde přiřadit, se uloží jako nespárovaná. Přiřadí ji správce, až bude administrace; do té doby Jakub.
- 🔸 Jak to dělá první verze (k doladění nad daty): VS `0`, který Fio posílá u některých trvalých příkazů, se bere jako platba bez VS a páruje se podle účtu; platba s VS, který žádný dárce nemá, zůstane nespárovaná, i když přišla z už přiřazeného účtu (překlep nesmí skončit jako cizí dar). Jméno odesílatele se k párování nepoužívá, jen číslo účtu.

## 6. Provoz

- ✅ Zatím na nfnn.znamenacek.duckdns.org (ZimaOS, Nginx Proxy Manager), až bude web hotový, přejde na vlastní doménu.
- 🔸 Angular + Spring Boot + PostgreSQL podle repa `bzumik1/nfnn`. Čeština; angličtina připravená na později.

## 7. Později, mimo první verzi

- Administrace pro správce (aktuality, projekty, nespárované platby).
- Posílání potvrzení e-mailem.
- Přidání čísla účtu v profilu s ověřením platbou 1 Kč ✅ (Jakub: „zní rozumně“).
- Smazání účtu dárcem.
- Platba kartou online.
- Samostatné stránky projektů, aktualit, dokumentů.
- Angličtina.
- Rozšíření přehledu dárce.

## 8. Co je potřeba změnit v `docs/api-contract.md`

Kontrakt vznikl před tímto zadáním a v těchto bodech se s ním rozchází:
- Registrace a profil (`/api/donors/auth/register`, `/api/donors/me`): typ dárce (člověk / firma), adresa, u firmy název, IČO a sídlo.
- Příjem darů: pravidelné stahování z Fio API místo ručního importu CSV; párování podle VS a pak podle čísla účtu odesílatele; nespárované platby se ukládají.
- `DonationRecorded` neposílá e-mail (v první verzi se nic neposílá).
- `GET /api/donations/me/summary`: souhrn po letech (rok, počet, částka) je v první verzi povinný.

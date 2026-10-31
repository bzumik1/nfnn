package cz.novanadeje.app.donors.application;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

import java.util.Map;
import java.util.UUID;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.params.provider.Arguments.arguments;

class AdminActionFactsTest {

    private static final String DONOR = "0192f0f1-0000-7000-8000-00000000000d";
    private static final String OTHER = "0192f0f1-0000-7000-8000-0000000000aa";
    private static final String LINK = "0192f0f1-0000-7000-8000-0000000000bb";

    static Stream<Arguments> czechAndEnglishRecords() {
        return Stream.of(
                arguments("PAIR_PAYMENT",
                        "Platba 26683551 (Money[amountMinor=50000, currency=CZK], zaúčtována 2026-10-10) ručně přiřazena dárci " + DONOR + " jako dar " + OTHER,
                        "PAIR_PAYMENT", Map.of("transaction", "26683551", "amount", "50000", "booked", "2026-10-10", "donor", DONOR)),
                arguments("PAIR_PAYMENT",
                        "Bank payment 26683551 (Money[amountMinor=50000, currency=CZK], booked 2026-10-10) paired by hand with donor " + DONOR + " as donation " + OTHER,
                        "PAIR_PAYMENT", Map.of("transaction", "26683551", "amount", "50000", "booked", "2026-10-10", "donor", DONOR)),
                arguments("UNPAIR_PAYMENT",
                        "Dar " + OTHER + " dárce " + DONOR + " (spárován podle VARIABLE_SYMBOL) odebrán z platby 26683551; platba se od teď páruje jen ručně",
                        "UNPAIR_PAYMENT", Map.of("donor", DONOR, "method", "VARIABLE_SYMBOL", "transaction", "26683551")),
                arguments("UNPAIR_PAYMENT",
                        "Donation " + OTHER + " of donor " + DONOR + " (paired by MANUAL) removed from bank payment 26683551; the payment is paired by hand only from now on",
                        "UNPAIR_PAYMENT", Map.of("donor", DONOR, "method", "MANUAL", "transaction", "26683551")),
                arguments("GRANT_ADMINISTRATION", "Role správce udělena dárci " + DONOR, "GRANT_ADMINISTRATION", Map.of("donor", DONOR)),
                arguments("GRANT_ADMINISTRATION", "Administrator role granted to donor " + DONOR, "GRANT_ADMINISTRATION", Map.of("donor", DONOR)),
                arguments("REVOKE_ADMINISTRATION", "Role správce odebrána dárci " + DONOR + "; všechna přihlášení dárce ukončena",
                        "REVOKE_ADMINISTRATION", Map.of("donor", DONOR)),
                arguments("REVOKE_ADMINISTRATION", "Administrator role taken from donor " + DONOR + "; every session of the donor was ended",
                        "REVOKE_ADMINISTRATION", Map.of("donor", DONOR)),
                arguments("RESET_SECOND_FACTOR", "Dvoufaktorové ověření dárce " + DONOR + " vypnuto; všechna přihlášení dárce ukončena",
                        "RESET_SECOND_FACTOR", Map.of("donor", DONOR)),
                arguments("RESET_SECOND_FACTOR", "Two-factor authentication of donor " + DONOR + " turned off; every session of the donor was ended",
                        "RESET_SECOND_FACTOR", Map.of("donor", DONOR)),
                arguments("RECOVER_SECOND_FACTOR",
                        "Dvoufaktorové ověření správce " + DONOR + " vypnuto platbou 1 Kč z ověřeného účtu 2900233333/2010; všechna přihlášení ukončena",
                        "RECOVER_SECOND_FACTOR", Map.of("donor", DONOR, "account", "2900233333/2010")),
                arguments("REMOVE_PASSKEYS", "Odebrané přístupové klíče dárce " + DONOR + ": 2; všechna přihlášení dárce ukončena",
                        "REMOVE_PASSKEYS", Map.of("donor", DONOR, "count", "2")),
                arguments("REMOVE_PASSKEYS", "2 passkeys of donor " + DONOR + " removed; every session of the donor was ended",
                        "REMOVE_PASSKEYS", Map.of("donor", DONOR, "count", "2")),
                arguments("REVERSE_SYMBOL_CLAIM",
                        "Odpověď Ano " + OTHER + " dárce " + DONOR + " u symbolu 6123456789 změněna na Ne; smazané dary spárované přes ni: 3",
                        "REVERSE_SYMBOL_CLAIM", Map.of("donor", DONOR, "symbol", "6123456789", "count", "3")),
                arguments("REVERSE_SYMBOL_CLAIM",
                        "Confirmed symbol claim " + OTHER + " of donor " + DONOR + " for symbol 6123456789 reversed to DECLINED; 3 donation(s) paired through it deleted",
                        "REVERSE_SYMBOL_CLAIM", Map.of("donor", DONOR, "symbol", "6123456789", "count", "3")),
                arguments("RESET_SYMBOL_CLAIM",
                        "Odpověď Ne " + OTHER + " dárce " + DONOR + " u symbolu 6123456789 smazána; účet se dárce může zeptat znovu",
                        "RESET_SYMBOL_CLAIM", Map.of("donor", DONOR, "symbol", "6123456789")),
                arguments("RESET_SYMBOL_CLAIM",
                        "Declined symbol claim " + OTHER + " of donor " + DONOR + " for symbol 6123456789 deleted; the account may ask the donor again",
                        "RESET_SYMBOL_CLAIM", Map.of("donor", DONOR, "symbol", "6123456789")),
                arguments("DISCONNECT_SENDER_ACCOUNT", "Párování z účtu 2900233333/2010 (propojení " + LINK + ") dárce " + DONOR + " vypnuto",
                        "DISCONNECT_SENDER_ACCOUNT", Map.of("account", "2900233333/2010", "donor", DONOR)),
                arguments("DISCONNECT_SENDER_ACCOUNT", "Pairing from bank account 2900233333/2010 (link " + LINK + ") of donor " + DONOR + " turned off",
                        "DISCONNECT_SENDER_ACCOUNT", Map.of("account", "2900233333/2010", "donor", DONOR)),
                arguments("RECONNECT_SENDER_ACCOUNT",
                        "Párování z účtu 2900233333/2010 (propojení " + LINK + ") dárce " + DONOR + " znovu zapnuto jako propojení " + OTHER
                                + ", čeká na platbu se symbolem",
                        "RECONNECT_SENDER_ACCOUNT", Map.of("account", "2900233333/2010", "donor", DONOR)),
                arguments("RECONNECT_SENDER_ACCOUNT",
                        "Pairing from bank account 2900233333/2010 (link " + LINK + ") of donor " + DONOR + " turned on again as link " + OTHER
                                + ", awaiting a payment with the symbol",
                        "RECONNECT_SENDER_ACCOUNT", Map.of("account", "2900233333/2010", "donor", DONOR)),
                arguments("REMOVE_SENDER_ACCOUNT_LINK",
                        "Účet 2900233333/2010 (propojení " + LINK + ", ACTIVE) odebrán dárci " + DONOR
                                + "; smazané dary spárované přes něj: 4, smazané odpovědi o starších symbolech: 1",
                        "REMOVE_SENDER_ACCOUNT_LINK", Map.of("account", "2900233333/2010", "donor", DONOR, "donations", "4", "answers", "1")),
                arguments("REMOVE_SENDER_ACCOUNT_LINK",
                        "Bank account 2900233333/2010 (link " + LINK + ", ACTIVE) removed from donor " + DONOR
                                + "; 4 donation(s) paired through it and 1 answer(s) about older symbols deleted",
                        "REMOVE_SENDER_ACCOUNT_LINK", Map.of("account", "2900233333/2010", "donor", DONOR, "donations", "4", "answers", "1")),
                arguments("ERASE_DONOR",
                        "Osobní údaje dárce " + DONOR + " vymazány: účet anonymizován, všechna přihlášení ukončena, bankovní účty a odpovědi o starších"
                                + " symbolech smazány; dary a potvrzení zůstávají",
                        "ERASE_DONOR", Map.of("donor", DONOR)),
                arguments("ERASE_DONOR",
                        "Personal data of donor " + DONOR + " erased: account anonymized, every session ended, bank accounts and older-symbol answers"
                                + " deleted; donations and receipts kept",
                        "ERASE_DONOR", Map.of("donor", DONOR)),
                arguments("CHANGE_REPORT_SETTINGS",
                        "Nastavení měsíčního přehledu změněno: příjemci jana@example.cz, petr@example.cz; odesílá se 3. den v měsíci v 7:00; části dárci, dary,"
                                + " platby bez dárce, stahování z banky",
                        "CHANGE_REPORT_SETTINGS", Map.of("recipients", "jana@example.cz, petr@example.cz", "day", "3", "hour", "7",
                                "sections", "DONORS,DONATIONS,UNPAIRED_PAYMENTS,BANK_IMPORT")),
                arguments("CHANGE_REPORT_SETTINGS",
                        "Monthly report settings changed: recipients jana@example.cz; sent on day 3 of the month; sections donors, unpaired payments",
                        "CHANGE_REPORT_SETTINGS.withoutHour", Map.of("recipients", "jana@example.cz", "day", "3", "sections", "DONORS,UNPAIRED_PAYMENTS")),
                arguments("SEND_MONTHLY_REPORT", "Měsíční přehled za 2026-09 ručně odeslán na jana@example.cz",
                        "SEND_MONTHLY_REPORT", Map.of("month", "2026-09", "recipients", "jana@example.cz")),
                arguments("SEND_MONTHLY_REPORT", "Monthly report for 2026-09 sent by hand to jana@example.cz, petr@example.cz",
                        "SEND_MONTHLY_REPORT", Map.of("month", "2026-09", "recipients", "jana@example.cz, petr@example.cz")),
                arguments("CHANGE_RECEIPT_SIGNATURE", "Nahrán obrázek podpisu na potvrzení o daru: 600 × 200 px, SHA-256 ab12",
                        "CHANGE_RECEIPT_SIGNATURE", Map.of("width", "600", "height", "200")),
                arguments("CHANGE_RECEIPT_SIGNATURE", "Signature image for receipts uploaded: 600x200 px, SHA-256 ab12",
                        "CHANGE_RECEIPT_SIGNATURE", Map.of("width", "600", "height", "200")),
                arguments("ISSUE_RECEIPT", "Potvrzení 2027-000001 za dar " + OTHER + " vystaveno dárci " + DONOR,
                        "ISSUE_RECEIPT", Map.of("number", "2027-000001", "donor", DONOR)),
                arguments("ISSUE_RECEIPT", "Potvrzení 2027-000004 za dar " + OTHER + " vystaveno dárci " + DONOR + "; nahrazuje potvrzení 2027-000001",
                        "ISSUE_RECEIPT.replacing", Map.of("number", "2027-000004", "donor", DONOR, "replaced", "2027-000001")),
                arguments("ISSUE_RECEIPT", "Potvrzení 2027-000002 za rok 2026 vystaveno dárci " + DONOR,
                        "ISSUE_RECEIPT.yearly", Map.of("number", "2027-000002", "year", "2026", "donor", DONOR)),
                arguments("ISSUE_RECEIPT", "Potvrzení 2027-000003 za rok 2026 vystaveno dárci " + DONOR + "; nahrazuje potvrzení 2027-000002",
                        "ISSUE_RECEIPT.yearlyReplacing", Map.of("number", "2027-000003", "year", "2026", "donor", DONOR, "replaced", "2027-000002")),
                arguments("REGISTER_RECEIPT_SIGNING_KEY", "Server zaregistroval svůj klíč k ověřovacím QR na potvrzeních o daru: 9c1b2f7e",
                        "REGISTER_RECEIPT_SIGNING_KEY", Map.of("key", "9c1b2f7e")),
                arguments("ADOPT_RECEIPT_SIGNING_KEY", "Server převzal klíč k ověřovacím QR 39f713d0 z obnovené zálohy (obnova 019a1b2c-0000-7000-8000-000000000005)",
                        "ADOPT_RECEIPT_SIGNING_KEY", Map.of("key", "39f713d0", "restore", "019a1b2c-0000-7000-8000-000000000005")),
                arguments("ADOPT_RECEIPT_SIGNING_KEY", "Server převzal klíč k ověřovacím QR 39f713d0 z obnovené zálohy (obnova 2026-11-13T10:02:41Z)",
                        "ADOPT_RECEIPT_SIGNING_KEY", Map.of("key", "39f713d0", "restore", "2026-11-13T10:02:41Z")),
                arguments("REMOVE_RECEIPT_SIGNATURE", "Obrázek podpisu odebrán; nová potvrzení o daru mají jen čáru a jméno",
                        "REMOVE_RECEIPT_SIGNATURE", Map.of()),
                arguments("REMOVE_RECEIPT_SIGNATURE", "Signature image for receipts removed; new receipts carry the line and the name only",
                        "REMOVE_RECEIPT_SIGNATURE", Map.of()),
                arguments("CHANGE_RECEIPT_SIGNATURE", "Nahrán obrázek podpisu na potvrzení o daru u osoby " + OTHER + ": 600 × 200 px, SHA-256 ab12",
                        "CHANGE_RECEIPT_SIGNATURE.person", Map.of("width", "600", "height", "200")),
                arguments("CHANGE_RECEIPT_SIGNATURE", "Nahrán vektorový podpis (SVG) na potvrzení o daru u osoby " + OTHER + ", SHA-256 ab12",
                        "CHANGE_RECEIPT_SIGNATURE.personVector", Map.of()),
                arguments("REMOVE_RECEIPT_SIGNATURE", "Obrázek podpisu na potvrzení o daru u osoby " + OTHER + " odebrán",
                        "REMOVE_RECEIPT_SIGNATURE.person", Map.of()),
                arguments("CHOOSE_RECEIPT_SIGNATORY", "Potvrzení o daru podepisuje osoba " + OTHER, "CHOOSE_RECEIPT_SIGNATORY", Map.of()),
                arguments("CHANGE_ABOUT_PHOTO", "Fotka " + OTHER + " v sekci O nás nastavena", "CHANGE_ABOUT_PHOTO", Map.of()),
                arguments("CHANGE_ABOUT_PHOTO", "Fotka " + OTHER + " v sekci O nás upravena", "CHANGE_ABOUT_PHOTO.edited", Map.of()),
                arguments("REMOVE_ABOUT_PHOTO", "Fotka " + OTHER + " v sekci O nás odebrána", "REMOVE_ABOUT_PHOTO", Map.of()),
                arguments("ADD_PERSON", "Osoba " + OTHER + " přidána mezi lidi fondu", "ADD_PERSON", Map.of()),
                arguments("UPDATE_PERSON", "Osoba " + OTHER + " v lidech fondu upravena", "UPDATE_PERSON", Map.of()),
                arguments("REMOVE_PERSON", "Osoba " + OTHER + " odebrána z lidí fondu", "REMOVE_PERSON", Map.of()),
                arguments("ORDER_PEOPLE", "Pořadí lidí fondu změněno", "ORDER_PEOPLE", Map.of()),
                arguments("CHANGE_FOUNDERS_NOTE", "Slovo zakladatelů upraveno", "CHANGE_FOUNDERS_NOTE", Map.of()),
                arguments("CHANGE_FOUNDERS_NOTE", "Slovo zakladatelů odebráno", "CHANGE_FOUNDERS_NOTE.removed", Map.of()),
                arguments("CHANGE_PEOPLE_FOOTNOTE", "Řádek pod správní radou upraven", "CHANGE_PEOPLE_FOOTNOTE", Map.of()),
                arguments("CHANGE_PEOPLE_FOOTNOTE", "Řádek pod správní radou odebrán", "CHANGE_PEOPLE_FOOTNOTE.removed", Map.of()),
                arguments("CHANGE_WEB_SIGNATURE", "Podpis " + OTHER + " na webu u osoby " + OTHER + " nastaven", "CHANGE_WEB_SIGNATURE", Map.of()),
                arguments("REMOVE_WEB_SIGNATURE", "Podpis na webu u osoby " + OTHER + " odebrán", "REMOVE_WEB_SIGNATURE", Map.of()),
                arguments("CHANGE_PROJECT_ORDER", "Řazení projektů na webu změněno z YEAR_THEN_CATEGORY na CATEGORY_THEN_YEAR", "CHANGE_PROJECT_ORDER",
                        Map.of("fromOrder", "YEAR_THEN_CATEGORY", "toOrder", "CATEGORY_THEN_YEAR")),
                arguments("CREATE_NEWS", "Aktualita " + OTHER + " „nove-kocarky“ napsána", "CREATE_NEWS", Map.of("slug", "nove-kocarky")),
                arguments("CREATE_NEWS", "News article " + OTHER + " 'nove-kocarky' created", "CREATE_NEWS", Map.of("slug", "nove-kocarky")),
                arguments("UPDATE_NEWS", "Aktualita " + OTHER + " „nove-kocarky“ upravena", "UPDATE_NEWS", Map.of("slug", "nove-kocarky")),
                arguments("UPDATE_NEWS", "News article " + OTHER + " 'nove-kocarky' updated", "UPDATE_NEWS", Map.of("slug", "nove-kocarky")),
                arguments("PUBLISH_NEWS", "Aktualita " + OTHER + " „nove-kocarky“ zveřejněna od 2026-10-20", "PUBLISH_NEWS",
                        Map.of("slug", "nove-kocarky", "on", "2026-10-20")),
                arguments("PUBLISH_NEWS", "News article " + OTHER + " 'nove-kocarky' published on 2026-10-20", "PUBLISH_NEWS",
                        Map.of("slug", "nove-kocarky", "on", "2026-10-20")),
                arguments("UNPUBLISH_NEWS", "Aktualita " + OTHER + " „nove-kocarky“ stažena z webu", "UNPUBLISH_NEWS", Map.of("slug", "nove-kocarky")),
                arguments("UNPUBLISH_NEWS", "News article " + OTHER + " 'nove-kocarky' unpublished", "UNPUBLISH_NEWS", Map.of("slug", "nove-kocarky")),
                arguments("DELETE_NEWS", "Aktualita " + OTHER + " „nove-kocarky“ smazána", "DELETE_NEWS", Map.of("slug", "nove-kocarky")),
                arguments("DELETE_NEWS", "News article " + OTHER + " 'nove-kocarky' deleted", "DELETE_NEWS", Map.of("slug", "nove-kocarky")),
                arguments("CREATE_PROJECT", "Projekt " + OTHER + " „skola“ napsán", "CREATE_PROJECT", Map.of("slug", "skola")),
                arguments("CREATE_PROJECT", "Project " + OTHER + " 'skola' created", "CREATE_PROJECT", Map.of("slug", "skola")),
                arguments("UPDATE_PROJECT", "Projekt " + OTHER + " „skola“ upraven", "UPDATE_PROJECT", Map.of("slug", "skola")),
                arguments("UPDATE_PROJECT", "Project " + OTHER + " 'skola' updated", "UPDATE_PROJECT", Map.of("slug", "skola")),
                arguments("PUBLISH_PROJECT", "Projekt " + OTHER + " „skola“ zveřejněn od 2026-10-20", "PUBLISH_PROJECT",
                        Map.of("slug", "skola", "on", "2026-10-20")),
                arguments("PUBLISH_PROJECT", "Project " + OTHER + " 'skola' published on 2026-10-20", "PUBLISH_PROJECT",
                        Map.of("slug", "skola", "on", "2026-10-20")),
                arguments("UNPUBLISH_PROJECT", "Projekt " + OTHER + " „skola“ stažen z webu", "UNPUBLISH_PROJECT", Map.of("slug", "skola")),
                arguments("UNPUBLISH_PROJECT", "Project " + OTHER + " 'skola' unpublished", "UNPUBLISH_PROJECT", Map.of("slug", "skola")),
                arguments("DELETE_PROJECT", "Projekt " + OTHER + " „skola“ smazán", "DELETE_PROJECT", Map.of("slug", "skola")),
                arguments("DELETE_PROJECT", "Project " + OTHER + " 'skola' deleted", "DELETE_PROJECT", Map.of("slug", "skola")),
                arguments("CREATE_NEWS", "Aktualita " + OTHER + " „nove-kocarky“ napsána; titulek „Nové kočárky pro „malé“ děti“", "CREATE_NEWS.withTitle",
                        Map.of("slug", "nove-kocarky", "title", "Nové kočárky pro „malé“ děti")),
                arguments("UPDATE_NEWS", "Aktualita " + OTHER + " „nove-kocarky“ upravena; titulek „Nové kočárky“", "UPDATE_NEWS.withTitle",
                        Map.of("slug", "nove-kocarky", "title", "Nové kočárky")),
                arguments("PUBLISH_NEWS", "Aktualita " + OTHER + " „nove-kocarky“ zveřejněna od 2026-10-20; titulek „Nové kočárky“", "PUBLISH_NEWS.withTitle",
                        Map.of("slug", "nove-kocarky", "on", "2026-10-20", "title", "Nové kočárky")),
                arguments("UNPUBLISH_NEWS", "Aktualita " + OTHER + " „nove-kocarky“ stažena z webu; titulek „Nové kočárky“", "UNPUBLISH_NEWS.withTitle",
                        Map.of("slug", "nove-kocarky", "title", "Nové kočárky")),
                arguments("DELETE_NEWS", "Aktualita " + OTHER + " „nove-kocarky“ smazána; titulek „Nové kočárky“", "DELETE_NEWS.withTitle",
                        Map.of("slug", "nove-kocarky", "title", "Nové kočárky")),
                arguments("CREATE_PROJECT", "Projekt " + OTHER + " „skola“ napsán; titulek „Škola v přírodě“", "CREATE_PROJECT.withTitle",
                        Map.of("slug", "skola", "title", "Škola v přírodě")),
                arguments("UPDATE_PROJECT", "Projekt " + OTHER + " „skola“ upraven; titulek „Škola v přírodě“", "UPDATE_PROJECT.withTitle",
                        Map.of("slug", "skola", "title", "Škola v přírodě")),
                arguments("PUBLISH_PROJECT", "Projekt " + OTHER + " „skola“ zveřejněn od 2026-10-20; titulek „Škola v přírodě“", "PUBLISH_PROJECT.withTitle",
                        Map.of("slug", "skola", "on", "2026-10-20", "title", "Škola v přírodě")),
                arguments("UNPUBLISH_PROJECT", "Projekt " + OTHER + " „skola“ stažen z webu; titulek „Škola v přírodě“", "UNPUBLISH_PROJECT.withTitle",
                        Map.of("slug", "skola", "title", "Škola v přírodě")),
                arguments("DELETE_PROJECT", "Projekt " + OTHER + " „skola“ smazán; titulek „Škola v přírodě“", "DELETE_PROJECT.withTitle",
                        Map.of("slug", "skola", "title", "Škola v přírodě")),
                arguments("CHANGE_BACKUP_SCHEDULE",
                        "Plán záloh změněn z „denní záloha 03:00, zkušební obnova v neděli 04:00“ na „denní záloha 02:30, zkušební obnova v sobotu 05:00“",
                        "CHANGE_BACKUP_SCHEDULE", Map.of("from", "denní záloha 03:00, zkušební obnova v neděli 04:00",
                                "to", "denní záloha 02:30, zkušební obnova v sobotu 05:00")),
                arguments("VIEW_BACKUP_KEY", "Zobrazen klíč k zálohám (ověřeno druhým faktorem)", "VIEW_BACKUP_KEY", Map.of()),
                arguments("VIEW_BACKUP_KEY_REFUSED", "Klíč k zálohám se nezobrazil: druhý faktor nesouhlasil", "VIEW_BACKUP_KEY_REFUSED", Map.of()),
                arguments("REQUEST_BACKUP", "Záloha databáze vyžádána (požadavek " + OTHER + ")", "REQUEST_BACKUP", Map.of()),
                arguments("REQUEST_BACKUP", "A backup was requested (request " + OTHER + ")", "REQUEST_BACKUP", Map.of()),
                arguments("REQUEST_TEST_RESTORE", "Zkušební obnova nejnovější zálohy vyžádána (požadavek " + OTHER + ")", "REQUEST_TEST_RESTORE", Map.of()),
                arguments("REQUEST_TEST_RESTORE", "A test restore of the newest backup was requested (request " + OTHER + ")", "REQUEST_TEST_RESTORE",
                        Map.of()),
                arguments("DOWNLOAD_BACKUP", "Záloha nfnn-2026-10-20.sql.gz (1048576 B) stažena", "DOWNLOAD_BACKUP",
                        Map.of("file", "nfnn-2026-10-20.sql.gz", "bytes", "1048576")),
                arguments("DOWNLOAD_BACKUP", "The backup nfnn-2026-10-20.sql.gz (1048576 bytes) was downloaded", "DOWNLOAD_BACKUP",
                        Map.of("file", "nfnn-2026-10-20.sql.gz", "bytes", "1048576")),
                arguments("RESTORE_BACKUP",
                        "Vyžádána obnova ze zálohy nfnn-2026-10-20.sql.gz (požadavek " + OTHER + "); backend se restartuje a počká na kontejner záloh",
                        "RESTORE_BACKUP", Map.of("file", "nfnn-2026-10-20.sql.gz")),
                arguments("RESTORE_BACKUP",
                        "A restore of nfnn-2026-10-20.sql.gz was requested (request " + OTHER + "); the backend restarts and waits for the backup container",
                        "RESTORE_BACKUP", Map.of("file", "nfnn-2026-10-20.sql.gz")),
                arguments("BACKUP_RESTORED", "Databáze obnovena ze zálohy nfnn-2026-10-20.sql.gz (požadavek " + OTHER + "), tabulek: 41",
                        "BACKUP_RESTORED.withTables", Map.of("file", "nfnn-2026-10-20.sql.gz", "tables", "41")),
                arguments("BACKUP_RESTORED", "Databáze obnovena ze zálohy nfnn-2026-10-20.sql.gz (požadavek " + OTHER + ")",
                        "BACKUP_RESTORED", Map.of("file", "nfnn-2026-10-20.sql.gz")),
                arguments("BACKUP_RESTORED", "The database was restored from nfnn-2026-10-20.sql.gz (request " + OTHER + "), 41 tables",
                        "BACKUP_RESTORED.withTables", Map.of("file", "nfnn-2026-10-20.sql.gz", "tables", "41")),
                arguments("BACKUP_RESTORE_FAILED",
                        "Obnova ze zálohy nfnn-2026-10-20.sql.gz (požadavek " + OTHER + ") selhala: pg_restore exited with 1; data zůstala, jak byla",
                        "BACKUP_RESTORE_FAILED", Map.of("file", "nfnn-2026-10-20.sql.gz")),
                arguments("BACKUP_RESTORE_FAILED",
                        "The restore of nfnn-2026-10-20.sql.gz (request " + OTHER + ") failed: pg_restore exited with 1; the data stayed as they were",
                        "BACKUP_RESTORE_FAILED", Map.of("file", "nfnn-2026-10-20.sql.gz")),
                arguments("CHANGE_LOG_LEVEL",
                        "Logger cz.novanadeje.app.donations nastaven na DEBUG do 2026-10-22T12:30:00Z (předtím: zděděná úroveň)",
                        "CHANGE_LOG_LEVEL", Map.of("logger", "cz.novanadeje.app.donations", "level", "DEBUG", "until", "2026-10-22T12:30:00Z",
                                "previous", "INHERITED")),
                arguments("CHANGE_LOG_LEVEL",
                        "The logger cz.novanadeje.app.donations was set to DEBUG until 2026-10-22T12:30:00.123Z (before: WARN)",
                        "CHANGE_LOG_LEVEL", Map.of("logger", "cz.novanadeje.app.donations", "level", "DEBUG", "until", "2026-10-22T12:30:00.123Z",
                                "previous", "WARN")),
                arguments("RESET_LOG_LEVEL", "Logger cz.novanadeje.app vrácen na zděděnou úroveň před koncem dočasné změny",
                        "RESET_LOG_LEVEL", Map.of("logger", "cz.novanadeje.app", "previous", "INHERITED")),
                arguments("RESET_LOG_LEVEL", "The logger cz.novanadeje.app went back to inherited before its override expired",
                        "RESET_LOG_LEVEL", Map.of("logger", "cz.novanadeje.app", "previous", "INHERITED")),
                arguments("RESET_LOG_LEVEL", "Logger cz.novanadeje.app vrácen na INFO před koncem dočasné změny",
                        "RESET_LOG_LEVEL", Map.of("logger", "cz.novanadeje.app", "previous", "INFO")),
                arguments("CHANGE_SETTINGS", "Změněna nastavení: MAIL_HOST, MAIL_PORT; backend se restartuje, aby je použil",
                        "CHANGE_SETTINGS", Map.of("settings", "MAIL_HOST,MAIL_PORT")),
                arguments("CHANGE_SETTINGS", "Settings changed: FIO_TOKEN; the backend restarts to apply them",
                        "CHANGE_SETTINGS", Map.of("settings", "FIO_TOKEN")));
    }

    @ParameterizedTest(name = "{0}: {1}")
    @MethodSource("czechAndEnglishRecords")
    @DisplayName("Given a record written in Czech or, before 24 October 2026, in English, when its details are read, then its facts come out the same")
    void should_read_same_facts_when_read_given_czech_or_english_record(String action, String details, String summaryKey, Map<String, String> facts) {
        AdminActionFacts read = AdminActionFacts.read(action, details).orElseThrow();

        assertThat(read.summaryKey()).isEqualTo(summaryKey);
        assertThat(read.values()).containsExactlyInAnyOrderEntriesOf(facts);
    }

    @Test
    @DisplayName("Given a record of a donor action, when its facts are read, then they name the donor the change concerned")
    void should_name_donor_when_read_given_donor_action() {
        AdminActionFacts read = AdminActionFacts.read("GRANT_ADMINISTRATION", "Role správce udělena dárci " + DONOR).orElseThrow();

        assertThat(read.donor()).contains(UUID.fromString(DONOR));
        assertThat(AdminActionFacts.read("REQUEST_BACKUP", "Záloha databáze vyžádána (požadavek " + OTHER + ")").orElseThrow().donor()).isEmpty();
    }

    @Test
    @DisplayName("Given an unknown action or details of another shape, when they are read, then no facts come out")
    void should_read_nothing_when_read_given_unknown_action_or_shape() {
        assertThat(AdminActionFacts.read("SOMETHING_NEW", "Role správce udělena dárci " + DONOR)).isEmpty();
        assertThat(AdminActionFacts.read("GRANT_ADMINISTRATION", "Role udělena někomu")).isEmpty();
    }
}

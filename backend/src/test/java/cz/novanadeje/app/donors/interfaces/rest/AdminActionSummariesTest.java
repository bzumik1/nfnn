package cz.novanadeje.app.donors.interfaces.rest;

import cz.novanadeje.app.donors.application.AdminActionFacts;
import cz.novanadeje.app.donors.application.AdminActionView;
import cz.novanadeje.app.donations.domain.donation.PairingMethod;
import cz.novanadeje.app.donors.domain.DeviceBrowser;
import cz.novanadeje.app.donors.domain.DevicePlatform;
import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.PasswordHash;
import cz.novanadeje.app.shared.domain.DonorName;
import cz.novanadeje.app.shared.domain.DonorType;
import cz.novanadeje.app.shared.domain.EmailAddress;
import cz.novanadeje.app.shared.domain.LocaleCode;
import cz.novanadeje.app.shared.domain.PostalAddress;
import cz.novanadeje.app.shared.domain.VariableSymbol;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.context.support.ResourceBundleMessageSource;
import org.springframework.context.support.StaticMessageSource;

import java.io.IOException;
import java.io.InputStreamReader;
import java.io.Reader;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Arrays;
import java.util.Locale;
import java.util.Objects;
import java.util.Optional;
import java.util.Properties;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.params.provider.Arguments.arguments;

class AdminActionSummariesTest {

    private static final Instant NOW = Instant.parse("2026-10-24T09:00:00Z");
    private static final Locale CZECH = Locale.forLanguageTag("cs");
    private static final DonorId PETR = DonorId.newId(NOW.minusSeconds(100));
    private static final String ID = "0192f0f1-0000-7000-8000-0000000000aa";
    private static final String SUMMARY = "admin.action.summary.";
    private static final Pattern PLACEHOLDER = Pattern.compile("\\{(\\w+)}");
    private static final Set<String> KEPT_ON_A_DEVICE = Set.of("donor", "amount", "booked", "method", "count", "symbol", "donations", "answers",
            "recipientCount", "day", "hour", "sections", "month", "on", "width", "height", "number", "replaced", "year", "issued", "unchanged", "skipped",
            "key", "restore", "fromOrder", "toOrder", "x", "y", "bank", "host", "slug", "title", "from", "to", "file", "bytes", "tables", "sessions",
            "secrets", "erasures", "credentials", "roles", "adminActions", "receiptNumbersSkipped", "platform", "browser", "logger", "level", "until",
            "previous", "settings");

    private final AdminActionSummaries summaries = new AdminActionSummaries(messages());

    static Stream<Arguments> records() {
        return Stream.of(
                arguments("PAIR_PAYMENT",
                        "Bank payment 26683551 (Money[amountMinor=50000, currency=CZK], booked 2026-10-10) paired by hand with donor " + PETR + " as donation " + ID,
                        "Platba 500 Kč ze dne 10. 10. 2026 ručně přiřazena dárci Petr Svoboda.",
                        "Payment of 500 CZK booked on 10 Oct 2026 paired by hand with donor Petr Svoboda."),
                arguments("PAIR_PAYMENT",
                        "Platba 26683551 (Money[amountMinor=123450, currency=CZK], zaúčtována 2026-03-05) ručně přiřazena dárci " + PETR + " jako dar " + ID,
                        "Platba 1 234,50 Kč ze dne 5. 3. 2026 ručně přiřazena dárci Petr Svoboda.",
                        "Payment of 1,234.50 CZK booked on 5 Mar 2026 paired by hand with donor Petr Svoboda."),
                arguments("UNPAIR_PAYMENT",
                        "Dar " + ID + " dárce " + PETR + " (spárován podle VARIABLE_SYMBOL) odebrán z platby 26683551; platba se od teď páruje jen ručně",
                        "Zrušeno přiřazení platby dárci Petr Svoboda (přiřazena byla podle variabilního symbolu); web ji už sám nepřiřadí.",
                        "Payment unpaired from donor Petr Svoboda (it was paired by the variable symbol); the site no longer pairs it by itself."),
                arguments("CHANGE_REPORT_SETTINGS",
                        "Monthly report settings changed: recipients jana@example.cz; sent on day 3 of the month; sections donors, unpaired payments",
                        "Změněno nastavení měsíčního přehledu: chodí na jana@example.cz 3. den v měsíci a obsahuje dárce, platby bez dárce.",
                        "Monthly report settings changed: sent to jana@example.cz on day 3 of the month with donors, payments without a donor."),
                arguments("CHANGE_REPORT_SETTINGS",
                        "Nastavení měsíčního přehledu změněno: počet příjemců 2; odesílá se 3. den v měsíci v 7:00; části dárci, dary",
                        "Změněno nastavení měsíčního přehledu: počet příjemců 2, chodí 3. den v měsíci v 7:00 a obsahuje dárce, dary.",
                        "Monthly report settings changed: 2 recipient(s), sent on day 3 of the month at 7:00 with donors, donations."),
                arguments("CHANGE_REPORT_SETTINGS",
                        "Monthly report settings changed: 1 recipient(s); sent on day 3 of the month; sections donors, unpaired payments",
                        "Změněno nastavení měsíčního přehledu: počet příjemců 1, chodí 3. den v měsíci a obsahuje dárce, platby bez dárce.",
                        "Monthly report settings changed: 1 recipient(s), sent on day 3 of the month with donors, payments without a donor."),
                arguments("SEND_MONTHLY_REPORT", "Měsíční přehled za 2026-09 ručně odeslán, počet příjemců 2",
                        "Měsíční přehled za září 2026 ručně odeslán, počet příjemců 2.",
                        "Monthly report for September 2026 sent by hand to 2 recipient(s)."),
                arguments("SEND_MONTHLY_REPORT", "Monthly report for 2026-09 sent by hand to 2 recipient(s)",
                        "Měsíční přehled za září 2026 ručně odeslán, počet příjemců 2.",
                        "Monthly report for September 2026 sent by hand to 2 recipient(s)."),
                arguments("SEND_MONTHLY_REPORT", "Monthly report for 2026-09 sent by hand to jana@example.cz",
                        "Měsíční přehled za září 2026 ručně odeslán na jana@example.cz.",
                        "Monthly report for September 2026 sent by hand to jana@example.cz."),
                arguments("REQUEST_HISTORY_IMPORT", "Vyžádáno načtení starších plateb z banky od 2026-01-01",
                        "Vyžádáno načtení starších plateb z banky od 1. 1. 2026.",
                        "Older bank payments requested from 1 Jan 2026."),
                arguments("CHANGE_LOG_LEVEL",
                        "The logger cz.novanadeje.app.donations was set to DEBUG until 2026-10-22T12:30:00Z (before: inherited)",
                        "Logger cz.novanadeje.app.donations dočasně nastaven na DEBUG do 22. 10. 2026 14:30 (předtím zděděná úroveň).",
                        "Logger cz.novanadeje.app.donations set to DEBUG until 22 Oct 2026 14:30 (before: inherited level)."),
                arguments("CHANGE_LOG_LEVEL",
                        "The logger cz.novanadeje.app.donations was set to DEBUG until 2026-03-05T07:05:00Z (before: inherited)",
                        "Logger cz.novanadeje.app.donations dočasně nastaven na DEBUG do 5. 3. 2026 8:05 (předtím zděděná úroveň).",
                        "Logger cz.novanadeje.app.donations set to DEBUG until 5 Mar 2026 08:05 (before: inherited level)."),
                arguments("CHANGE_SETTINGS", "Settings changed: MAIL_HOST, MAIL_PORT; the backend restarts to apply them",
                        "Změněna nastavení: Server pro odesílání (SMTP), Port. Web se restartoval, aby je použil.",
                        "Settings changed: Outgoing mail server (SMTP), Port. The site restarted to apply them."),
                arguments("DOWNLOAD_BACKUP", "Záloha nfnn-2026-10-20.sql.gz (1572864 B) stažena",
                        "Stažena záloha nfnn-2026-10-20.sql.gz (1,5 MB).",
                        "Backup nfnn-2026-10-20.sql.gz downloaded (1.5 MB)."),
                arguments("STORE_ADMINISTRATION_COPY", "Kopie správy uložena do zařízení IPHONE SAFARI (zařízení " + ID + ")",
                        "Kopie správy uložena do zařízení iPhone · Safari.",
                        "A copy of the administration stored on iPhone · Safari."),
                arguments("STORE_ADMINISTRATION_COPY", "Kopie správy uložena do zařízení OTHER OTHER",
                        "Kopie správy uložena do zařízení jiné zařízení · jiný prohlížeč.",
                        "A copy of the administration stored on another device · another browser."),
                arguments("VIEW_BACKUP_KEY", "Zobrazen klíč k zálohám (ověřeno druhým faktorem)",
                        "Zobrazen klíč k zálohám (ověřeno druhým faktorem).",
                        "Backup key shown (confirmed with the second factor)."),
                arguments("ISSUE_RECEIPTS", "Hromadně vystavena roční potvrzení za rok 2026: nová 12, nahrazená 2, beze změny 28, přeskočená 1",
                        "Hromadně vystavena roční potvrzení za rok 2026: nová 12, nahrazená 2, beze změny 28, přeskočená 1.",
                        "Yearly receipts for 2026 issued in bulk: 12 new, 2 replaced, 28 unchanged, 1 skipped."),
                arguments("WITHDRAW_RECEIPT",
                        "Potvrzení 2027-000002 za rok 2026 dárce " + PETR + " zrušeno, protože z něj byl odebrán dar " + ID + " platby 26683551",
                        "Dárci Petr Svoboda zrušeno roční potvrzení 2027-000002 za rok 2026, protože se zrušilo přiřazení daru, který na něm byl; ověření ukáže, že platilo ke dni vystavení.",
                        "Yearly receipt 2027-000002 for 2026 of donor Petr Svoboda withdrawn because a donation on it was unpaired; verifying it shows it was valid on the day it was issued."),
                arguments("VIEW_BACKUP_KEY_REFUSED", "Klíč k zálohám se nezobrazil: druhý faktor nesouhlasil",
                        "Klíč k zálohám se nezobrazil: druhý faktor nesouhlasil.",
                        "Backup key not shown: the second factor did not match."),
                arguments("CHANGE_ABOUT_PHOTO", "Fotka " + ID + " v sekci O nás nastavena",
                        "Nastavena fotka v sekci O nás.",
                        "Photo set in the About section."),
                arguments("CHANGE_ABOUT_PHOTO", "Fotka " + ID + " v sekci O nás upravena",
                        "Upraven popis fotky v sekci O nás.",
                        "Description of the photo in the About section edited."),
                arguments("REMOVE_ABOUT_PHOTO", "Fotka " + ID + " v sekci O nás odebrána",
                        "Fotka odebrána ze sekce O nás.",
                        "Photo removed from the About section."),
                arguments("CHANGE_DONATE_BAND_PHOTO", "Fotka " + ID + " v pruhu Přispět nastavena",
                        "Nastavena fotka v pruhu Přispět.",
                        "Photo set in the Přispět band."),
                arguments("CHANGE_DONATE_BAND_PHOTO", "Fotka " + ID + " v pruhu Přispět upravena",
                        "Upraven popis fotky v pruhu Přispět.",
                        "Description of the photo in the Přispět band edited."),
                arguments("REMOVE_DONATE_BAND_PHOTO", "Fotka " + ID + " v pruhu Přispět odebrána",
                        "Fotka odebrána z pruhu Přispět.",
                        "Photo removed from the Přispět band."),
                arguments("CHANGE_PHOTO_FOCAL_POINT", "Bod výřezu fotky " + ID + " nastaven na 42 % zleva a 18 % shora",
                        "Nastaven bod výřezu fotky: 42 % zleva, 18 % shora.",
                        "Photo focal point set: 42 % from the left, 18 % from the top."),
                arguments("CHANGE_PHOTO_FOCAL_POINT", "Bod výřezu fotky " + ID + " zrušen, fotka se ořezává kolem středu",
                        "Zrušen bod výřezu fotky.",
                        "Photo focal point removed."),
                arguments("ADD_PERSON", "Osoba " + ID + " přidána mezi lidi fondu",
                        "Přidána osoba mezi lidi fondu.",
                        "Person added to the people of the foundation."),
                arguments("REMOVE_PERSON", "Osoba " + ID + " odebrána z lidí fondu",
                        "Odebrána osoba z lidí fondu.",
                        "Person removed from the people of the foundation."),
                arguments("CHANGE_FOUNDERS_NOTE", "Slovo zakladatelů odebráno",
                        "Odebráno slovo zakladatelů.",
                        "Founders’ note removed."),
                arguments("CHANGE_PEOPLE_FOOTNOTE", "Řádek pod správní radou odebrán",
                        "Odebrán řádek pod správní radou.",
                        "Line under the board removed."),
                arguments("CHANGE_WEB_SIGNATURE", "Podpis " + ID + " na webu u osoby " + ID + " nastaven",
                        "Nahrán podpis pro web u osoby z lidí fondu.",
                        "Web signature of a person of the foundation uploaded."),
                arguments("REMOVE_WEB_SIGNATURE", "Podpis na webu u osoby " + ID + " odebrán",
                        "Odebrán podpis z webu u osoby z lidí fondu.",
                        "Web signature of a person of the foundation removed."),
                arguments("CHANGE_SIGNATURE", "Podpis " + ID + " u osoby " + ID + " nastaven",
                        "Nahrán podpis osoby z lidí fondu; tiskne se i na potvrzení o daru, která podepisuje.",
                        "Signature of a person of the foundation uploaded; it is printed on the receipts they sign too."),
                arguments("REMOVE_SIGNATURE", "Podpis u osoby " + ID + " odebrán",
                        "Odebrán podpis osoby z lidí fondu.",
                        "Signature of a person of the foundation removed."),
                arguments("SET_BANK_LOGO_SOURCE", "Logo banky 0800 nastaveno z is1-ssl.mzstatic.com, obrázek 000000000000000000000000000000000000000000000000000000000000000a",
                        "Nastaveno logo banky 0800 stažené z is1-ssl.mzstatic.com.",
                        "Logo of bank 0800 set, downloaded from is1-ssl.mzstatic.com."),
                arguments("REFRESH_BANK_LOGO", "Logo banky 0800 znovu staženo z www.csas.cz, obrázek 000000000000000000000000000000000000000000000000000000000000000a",
                        "Logo banky 0800 znovu staženo z www.csas.cz.",
                        "Logo of bank 0800 downloaded again from www.csas.cz."),
                arguments("REMOVE_BANK_LOGO", "Logo banky 0800 odebráno",
                        "Odebráno logo banky 0800.",
                        "Logo of bank 0800 removed."),
                arguments("CHANGE_PROJECT_ORDER", "Řazení projektů na webu změněno z YEAR na CATEGORY_THEN_YEAR",
                        "Řazení příběhů na webu změněno z „podle roku“ na „podle kategorie, v ní podle roku“.",
                        "Order of the projects on the site changed from “by year” to “by category, within it by year”."),
                arguments("PUBLISH_NEWS", "Aktualita " + ID + " „nove-kocarky“ zveřejněna od 2026-10-20",
                        "Aktualita „nove-kocarky“ zveřejněna od 20. 10. 2026.",
                        "News article “nove-kocarky” published from 20 Oct 2026."),
                arguments("CREATE_NEWS", "Aktualita " + ID + " „vanocni-sbirka-2026“ napsána; titulek „Vánoční sbírka 2026“",
                        "Napsána aktualita „Vánoční sbírka 2026“.",
                        "News article “Vánoční sbírka 2026” written."),
                arguments("UPDATE_NEWS", "Aktualita " + ID + " „vanocni-sbirka-2026“ upravena; titulek „Vánoční sbírka 2026“",
                        "Upravena aktualita „Vánoční sbírka 2026“.",
                        "News article “Vánoční sbírka 2026” edited."),
                arguments("PUBLISH_NEWS", "Aktualita " + ID + " „vanocni-sbirka-2026“ zveřejněna od 2026-10-29; titulek „Vánoční sbírka 2026“",
                        "Aktualita „Vánoční sbírka 2026“ zveřejněna od 29. 10. 2026.",
                        "News article “Vánoční sbírka 2026” published from 29 Oct 2026."),
                arguments("UNPUBLISH_NEWS", "Aktualita " + ID + " „vanocni-sbirka-2026“ stažena z webu; titulek „Vánoční sbírka 2026“",
                        "Aktualita „Vánoční sbírka 2026“ stažena z webu.",
                        "News article “Vánoční sbírka 2026” taken off the site."),
                arguments("DELETE_NEWS", "Aktualita " + ID + " „vanocni-sbirka-2026“ smazána; titulek „Vánoční sbírka 2026“",
                        "Aktualita „Vánoční sbírka 2026“ smazána.",
                        "News article “Vánoční sbírka 2026” deleted."),
                arguments("CHANGE_NEWS_LOOK_BACK_YEAR", "Aktualita " + ID + " „ohlednuti-2025“ se ohlíží za rokem 2025; titulek „Ohlédnutí za rokem 2025“",
                        "Aktualita „Ohlédnutí za rokem 2025“ se ohlíží za rokem 2025.",
                        "News article “Ohlédnutí za rokem 2025” looks back on the year 2025."),
                arguments("CHANGE_NEWS_LOOK_BACK_YEAR", "Aktualita " + ID + " „ohlednuti-2025“ se už neohlíží za žádným rokem; titulek „Ohlédnutí za rokem 2025“",
                        "Aktualita „Ohlédnutí za rokem 2025“ se už neohlíží za žádným rokem.",
                        "News article “Ohlédnutí za rokem 2025” no longer looks back on a year."),
                arguments("CREATE_PROJECT", "Projekt " + ID + " „doucovani“ napsán; titulek „Doučování a školní pomůcky“",
                        "Napsán příběh „Doučování a školní pomůcky“.",
                        "Project “Doučování a školní pomůcky” written."),
                arguments("UPDATE_PROJECT", "Projekt " + ID + " „doucovani“ upraven; titulek „Doučování a školní pomůcky“",
                        "Upraven příběh „Doučování a školní pomůcky“.",
                        "Project “Doučování a školní pomůcky” edited."),
                arguments("PUBLISH_PROJECT", "Projekt " + ID + " „doucovani“ zveřejněn od 2026-10-29; titulek „Doučování a školní pomůcky“",
                        "Příběh „Doučování a školní pomůcky“ zveřejněn od 29. 10. 2026.",
                        "Project “Doučování a školní pomůcky” published from 29 Oct 2026."),
                arguments("UNPUBLISH_PROJECT", "Projekt " + ID + " „doucovani“ stažen z webu; titulek „Doučování a školní pomůcky“",
                        "Příběh „Doučování a školní pomůcky“ stažen z webu.",
                        "Project “Doučování a školní pomůcky” taken off the site."),
                arguments("DELETE_PROJECT", "Projekt " + ID + " „doucovani“ smazán; titulek „Doučování a školní pomůcky“",
                        "Příběh „Doučování a školní pomůcky“ smazán.",
                        "Project “Doučování a školní pomůcky” deleted."));
    }

    @ParameterizedTest(name = "{0}: {1}")
    @MethodSource("records")
    @DisplayName("Given a record with known details, when it is summarized in Czech and in English, then each reads as a sentence without codes or ids")
    void should_write_sentence_when_summarized_given_known_details(String action, String details, String czech, String english) {
        AdminActionView view = view(action, details, Optional.of(petr()));

        assertThat(summaries.summary(view, CZECH)).isEqualTo(czech);
        assertThat(summaries.summary(view, Locale.ENGLISH)).isEqualTo(english);
    }

    @Test
    @DisplayName("Given a record about a donor whose account is gone or erased, when it is summarized, then the sentence says so instead of a name")
    void should_say_donor_is_gone_when_summarized_given_missing_or_erased_donor() {
        String details = "Role správce udělena dárci " + PETR;
        Donor erased = petr();
        erased.erase(NOW);

        assertThat(summaries.summary(view("GRANT_ADMINISTRATION", details, Optional.empty()), CZECH))
                .isEqualTo("Role správce udělena dárci (účet už neexistuje).");
        assertThat(summaries.summary(view("GRANT_ADMINISTRATION", details, Optional.of(erased)), CZECH))
                .isEqualTo("Role správce udělena dárci (osobní údaje vymazány).");
    }

    @Test
    @DisplayName("Given a record whose details have no known shape, when it is summarized, then the stored details are shown as they are")
    void should_show_details_when_summarized_given_unknown_shape() {
        AdminActionView view = view("SOMETHING_NEW", "Something happened to " + ID, Optional.empty());

        assertThat(summaries.summary(view, CZECH)).isEqualTo("Something happened to " + ID);
    }

    @Test
    @DisplayName("Given a record whose details have no known shape, when its sentence for a device copy is asked, then there is none, so the details stay on the server")
    void should_give_no_sentence_when_written_for_a_copy_given_unknown_shape() {
        AdminActionView view = view("SOMETHING_NEW", "Something happened to " + ID, Optional.empty());

        assertThat(summaries.sentenceOnADevice(view)).isEmpty();
    }

    @Test
    @DisplayName("Given a record with known details about an erased donor, when its sentence for a device copy is asked, then it is the list's sentence, without the name")
    void should_give_the_list_sentence_when_written_for_a_copy_given_known_details() {
        Donor erased = petr();
        erased.erase(NOW);
        AdminActionView view = view("GRANT_ADMINISTRATION", "Role správce udělena dárci " + PETR, Optional.of(erased));

        assertThat(summaries.sentenceOnADevice(view)).contains("Role správce udělena dárci (osobní údaje vymazány).");
        assertThat(summaries.sentenceOnADevice(view)).contains(summaries.summary(view, CZECH));
    }

    @Test
    @DisplayName("Given records that name a bank account, when their sentences for a device copy are asked, then they read without the account, for a live and an erased donor")
    void should_leave_out_the_account_when_written_for_a_copy_given_records_naming_an_account() {
        Donor erased = petr();
        erased.erase(NOW);
        String link = "0192f0f1-0000-7000-8000-0000000000bb";

        assertThat(summaries.sentenceOnADevice(view("DISCONNECT_SENDER_ACCOUNT", "Párování z účtu 2900233333/2010 (propojení " + link + ") dárce " + PETR
                + " vypnuto", Optional.of(petr())))).contains("Párování plateb z jednoho bankovního účtu dárci Petr Svoboda vypnuto.");
        assertThat(summaries.sentenceOnADevice(view("RECONNECT_SENDER_ACCOUNT", "Párování z účtu 2900233333/2010 (propojení " + link + ") dárce " + PETR
                + " znovu zapnuto jako propojení " + ID + ", čeká na platbu se symbolem", Optional.of(erased))))
                .contains("Párování plateb z jednoho bankovního účtu dárci (osobní údaje vymazány) znovu zapnuto; začne platit po platbě z účtu s variabilním "
                        + "symbolem dárce.");
        assertThat(summaries.sentenceOnADevice(view("REMOVE_SENDER_ACCOUNT_LINK", "Účet 2900233333/2010 (propojení " + link + ", ACTIVE) odebrán dárci "
                + PETR + "; smazané dary spárované přes něj: 4, smazané odpovědi o starších symbolech: 1", Optional.of(erased))))
                .contains("Bankovní účet odebrán dárci (osobní údaje vymazány); smazané dary přiřazené podle účtu: 4, smazané odpovědi o starších symbolech: 1.");
        assertThat(summaries.sentenceOnADevice(view("RECOVER_SECOND_FACTOR", "Dvoufaktorové ověření správce " + PETR + " vypnuto platbou 1 Kč z ověřeného účtu "
                + "2900233333/2010; všechna přihlášení ukončena", Optional.of(petr()))))
                .contains("Dvoufaktorové ověření správce Petr Svoboda vypnuto platbou 1 Kč z ověřeného účtu správce; všechna přihlášení správce skončila.");
    }

    @Test
    @DisplayName("Given records that name the report's recipients by address, when their sentences for a device copy are asked, then they count the recipients instead")
    void should_count_the_recipients_when_written_for_a_copy_given_recipients_by_address() {
        assertThat(summaries.sentenceOnADevice(view("CHANGE_REPORT_SETTINGS", "Nastavení měsíčního přehledu změněno: příjemci pokladni@example.cz, "
                + "revize@example.cz; odesílá se 3. den v měsíci v 7:00; části dárci, dary", Optional.empty())))
                .contains("Změněno nastavení měsíčního přehledu: počet příjemců 2, chodí 3. den v měsíci v 7:00 a obsahuje dárce, dary.");
        assertThat(summaries.sentenceOnADevice(view("CHANGE_REPORT_SETTINGS", "Monthly report settings changed: recipients pokladni@example.cz; sent on "
                + "day 3 of the month; sections donors, unpaired payments", Optional.empty())))
                .contains("Změněno nastavení měsíčního přehledu: počet příjemců 1, chodí 3. den v měsíci a obsahuje dárce, platby bez dárce.");
        assertThat(summaries.sentenceOnADevice(view("SEND_MONTHLY_REPORT", "Monthly report for 2026-09 sent by hand to pokladni@example.cz", Optional.empty())))
                .contains("Měsíční přehled za září 2026 ručně odeslán, počet příjemců 1.");
    }

    @Test
    @DisplayName("Given an article whose title holds an e-mail address, when its sentence for a device copy is asked, then there is none")
    void should_give_no_sentence_when_written_for_a_copy_given_an_email_address_in_a_title() {
        AdminActionView view = view("CREATE_NEWS", "Aktualita " + ID + " „pis-nam“ napsána; titulek „Pište na pokladni@example.cz“", Optional.empty());

        assertThat(summaries.sentence(view, CZECH)).contains("Napsána aktualita „Pište na pokladni@example.cz“.");
        assertThat(summaries.sentenceOnADevice(view)).isEmpty();
    }

    @Test
    @DisplayName("Given every summary template, when their placeholders are classified, then each is one a device keeps or one it never fills, and every template with the latter has a wording for a device")
    void should_classify_every_placeholder_when_the_templates_are_read_given_every_summary_template() throws IOException {
        Properties czech = texts("i18n/messages_cs.properties");
        Set<String> templates = czech.stringPropertyNames().stream().filter(key -> key.startsWith(SUMMARY)).collect(Collectors.toSet());
        Set<String> placeholders = templates.stream().flatMap(key -> placeholdersOf(czech.getProperty(key))).collect(Collectors.toSet());

        assertThat(placeholders).isSubsetOf(Stream.concat(KEPT_ON_A_DEVICE.stream(), AdminActionFacts.NEVER_ON_A_DEVICE.stream()).toList());
        templates.stream().filter(key -> placeholdersOf(czech.getProperty(key)).anyMatch(AdminActionFacts.NEVER_ON_A_DEVICE::contains))
                .forEach(key -> assertThat(templates).as("the wording for a device of %s", key)
                        .containsAnyOf(key + ".withoutAccount", key + ".recipientCount", key + "RecipientCount"));
    }

    @Test
    @DisplayName("Given every device platform, browser and pairing method, when their texts are looked up, then each has a Czech and an English one")
    void should_have_czech_and_english_texts_when_looked_up_given_every_platform_browser_and_method() throws IOException {
        Properties czech = texts("i18n/messages_cs.properties");
        Properties english = texts("i18n/messages_en.properties");
        Stream<String> keys = Stream.of(
                Arrays.stream(DevicePlatform.values()).map(value -> "admin.action.platform." + value.name()),
                Arrays.stream(DeviceBrowser.values()).map(value -> "admin.action.browser." + value.name()),
                Arrays.stream(PairingMethod.values()).map(value -> "admin.action.method." + value.name())).flatMap(Function.identity());

        keys.forEach(key -> {
            assertThat(czech.getProperty(key)).as("the Czech text %s", key).isNotBlank();
            assertThat(english.getProperty(key)).as("the English text %s", key).isNotBlank();
        });
    }

    @Test
    @DisplayName("Given a record from a device platform no text knows, when it is summarized, then the platform's code stands in for its name")
    void should_write_the_code_when_summarized_given_a_platform_without_a_text() {
        AdminActionView view = view("STORE_ADMINISTRATION_COPY", "Kopie správy uložena do zařízení STEAMDECK SAFARI", Optional.empty());

        assertThat(summaries.sentenceOnADevice(view)).contains("Kopie správy uložena do zařízení STEAMDECK · Safari.");
    }

    @Test
    @DisplayName("Given a template whose formats are missing, when the record is summarized, then the list shows the stored details and a device copy no sentence, instead of failing")
    void should_fall_back_when_summarized_given_a_sentence_that_cannot_be_written() {
        StaticMessageSource incomplete = new StaticMessageSource();
        incomplete.addMessage("admin.action.summary.PAIR_PAYMENT", CZECH, "Platba {amount} ze dne {booked} ručně přiřazena dárci {donor}.");
        AdminActionSummaries withoutFormats = new AdminActionSummaries(incomplete);
        String details = "Platba 26683551 (Money[amountMinor=50000, currency=CZK], zaúčtována 2026-10-10) ručně přiřazena dárci " + PETR + " jako dar " + ID;
        AdminActionView view = view("PAIR_PAYMENT", details, Optional.of(petr()));

        assertThat(withoutFormats.sentenceOnADevice(view)).isEmpty();
        assertThat(withoutFormats.summary(view, CZECH)).isEqualTo(details);
    }

    @Test
    @DisplayName("Given a language without its own texts, when a record is summarized, then the Czech sentence is shown")
    void should_write_czech_when_summarized_given_other_language() {
        AdminActionView view = view("GRANT_ADMINISTRATION", "Role správce udělena dárci " + PETR, Optional.of(petr()));

        assertThat(summaries.summary(view, Locale.GERMAN)).isEqualTo("Role správce udělena dárci Petr Svoboda.");
    }

    @Test
    @DisplayName("Given the Czech and the English texts, when their history keys are compared, then each Czech text has an English one and back")
    void should_have_same_keys_when_compared_given_czech_and_english_texts() throws IOException {
        assertThat(historyKeys("i18n/messages_en.properties")).isEqualTo(historyKeys("i18n/messages_cs.properties")).isNotEmpty();
    }

    private static AdminActionView view(String action, String details, Optional<Donor> donor) {
        return new AdminActionView(UUID.randomUUID(), UUID.randomUUID(), Optional.empty(), action, Optional.empty(), details, NOW, Optional.empty(),
                AdminActionFacts.read(action, details), donor);
    }

    private static Donor petr() {
        return Donor.register(PETR, DonorType.PERSON, new DonorName("Petr Svoboda"), null, new PostalAddress("Dlouhá 12", "Ústí nad Labem", "400 01"),
                new EmailAddress("petr@example.cz"), new PasswordHash("$hash"), new VariableSymbol("4821937560"), LocaleCode.CS, NOW);
    }

    private static Set<String> historyKeys(String resource) throws IOException {
        return texts(resource).stringPropertyNames().stream().filter(key -> key.startsWith("admin.action.")).collect(Collectors.toSet());
    }

    private static Properties texts(String resource) throws IOException {
        Properties properties = new Properties();
        try (Reader reader = new InputStreamReader(Objects.requireNonNull(AdminActionSummariesTest.class.getClassLoader().getResourceAsStream(resource)),
                StandardCharsets.UTF_8)) {
            properties.load(reader);
        }
        return properties;
    }

    private static Stream<String> placeholdersOf(String template) {
        return PLACEHOLDER.matcher(template).results().map(placeholder -> placeholder.group(1));
    }

    private static ResourceBundleMessageSource messages() {
        ResourceBundleMessageSource messages = new ResourceBundleMessageSource();
        messages.setBasename("i18n/messages");
        messages.setDefaultEncoding("UTF-8");
        messages.setFallbackToSystemLocale(false);
        return messages;
    }
}

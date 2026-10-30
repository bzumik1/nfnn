package cz.novanadeje.app.donors.interfaces.rest;

import cz.novanadeje.app.donors.application.AdminActionFacts;
import cz.novanadeje.app.donors.application.AdminActionView;
import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.PasswordHash;
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

import java.io.IOException;
import java.io.InputStreamReader;
import java.io.Reader;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Locale;
import java.util.Objects;
import java.util.Optional;
import java.util.Properties;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.params.provider.Arguments.arguments;

class AdminActionSummariesTest {

    private static final Instant NOW = Instant.parse("2026-10-24T09:00:00Z");
    private static final Locale CZECH = Locale.forLanguageTag("cs");
    private static final DonorId PETR = DonorId.newId(NOW.minusSeconds(100));
    private static final String ID = "0192f0f1-0000-7000-8000-0000000000aa";

    private final AdminActionSummaries summaries = new AdminActionSummaries(messages());

    static Stream<Arguments> records() {
        return Stream.of(
                arguments("PAIR_PAYMENT",
                        "Bank payment 26683551 (Money[amountMinor=50000, currency=CZK], booked 2026-10-10) paired by hand with donor " + PETR + " as donation " + ID,
                        "Platba 500 Kč ze dne 10. 10. 2026 ručně přiřazena dárci Petr Svoboda.",
                        "Payment of 500 CZK booked on 10 Oct 2026 paired by hand with donor Petr Svoboda."),
                arguments("PAIR_PAYMENT",
                        "Platba 26683551 (Money[amountMinor=123450, currency=CZK], zaúčtována 2026-03-05) ručně přiřazena dárci " + PETR + " jako dar " + ID,
                        "Platba 1 234,50 Kč ze dne 05. 03. 2026 ručně přiřazena dárci Petr Svoboda.",
                        "Payment of 1,234.50 CZK booked on 5 Mar 2026 paired by hand with donor Petr Svoboda."),
                arguments("UNPAIR_PAYMENT",
                        "Dar " + ID + " dárce " + PETR + " (spárován podle VARIABLE_SYMBOL) odebrán z platby 26683551; platba se od teď páruje jen ručně",
                        "Zrušeno přiřazení platby dárci Petr Svoboda (přiřazena byla podle variabilního symbolu); web ji už sám nepřiřadí.",
                        "Payment unpaired from donor Petr Svoboda (it was paired by the variable symbol); the site no longer pairs it by itself."),
                arguments("CHANGE_REPORT_SETTINGS",
                        "Monthly report settings changed: recipients jana@example.cz; sent on day 3 of the month; sections donors, unpaired payments",
                        "Změněno nastavení měsíčního přehledu: chodí na jana@example.cz 3. den v měsíci a obsahuje dárce, platby bez dárce.",
                        "Monthly report settings changed: sent to jana@example.cz on day 3 of the month with donors, payments without a donor."),
                arguments("SEND_MONTHLY_REPORT", "Monthly report for 2026-09 sent by hand to jana@example.cz",
                        "Měsíční přehled za září 2026 ručně odeslán na jana@example.cz.",
                        "Monthly report for September 2026 sent by hand to jana@example.cz."),
                arguments("CHANGE_LOG_LEVEL",
                        "The logger cz.novanadeje.app.donations was set to DEBUG until 2026-10-22T12:30:00Z (before: inherited)",
                        "Logger cz.novanadeje.app.donations dočasně nastaven na DEBUG do 22. 10. 2026 14:30 (předtím zděděná úroveň).",
                        "Logger cz.novanadeje.app.donations set to DEBUG until 22 Oct 2026 14:30 (before: inherited level)."),
                arguments("CHANGE_SETTINGS", "Settings changed: MAIL_HOST, MAIL_PORT; the backend restarts to apply them",
                        "Změněna nastavení: Server pro odesílání (SMTP), Port. Web se restartoval, aby je použil.",
                        "Settings changed: Outgoing mail server (SMTP), Port. The site restarted to apply them."),
                arguments("DOWNLOAD_BACKUP", "Záloha nfnn-2026-10-20.sql.gz (1572864 B) stažena",
                        "Stažena záloha nfnn-2026-10-20.sql.gz (1,5 MB).",
                        "Backup nfnn-2026-10-20.sql.gz downloaded (1.5 MB)."),
                arguments("VIEW_BACKUP_KEY", "Zobrazen klíč k zálohám (ověřeno druhým faktorem)",
                        "Zobrazen klíč k zálohám (ověřeno druhým faktorem).",
                        "Backup key shown (confirmed with the second factor)."),
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
                arguments("CREATE_PROJECT", "Projekt " + ID + " „doucovani“ napsán; titulek „Doučování a školní pomůcky“",
                        "Napsán projekt „Doučování a školní pomůcky“.",
                        "Project “Doučování a školní pomůcky” written."),
                arguments("UPDATE_PROJECT", "Projekt " + ID + " „doucovani“ upraven; titulek „Doučování a školní pomůcky“",
                        "Upraven projekt „Doučování a školní pomůcky“.",
                        "Project “Doučování a školní pomůcky” edited."),
                arguments("PUBLISH_PROJECT", "Projekt " + ID + " „doucovani“ zveřejněn od 2026-10-29; titulek „Doučování a školní pomůcky“",
                        "Projekt „Doučování a školní pomůcky“ zveřejněn od 29. 10. 2026.",
                        "Project “Doučování a školní pomůcky” published from 29 Oct 2026."),
                arguments("UNPUBLISH_PROJECT", "Projekt " + ID + " „doucovani“ stažen z webu; titulek „Doučování a školní pomůcky“",
                        "Projekt „Doučování a školní pomůcky“ stažen z webu.",
                        "Project “Doučování a školní pomůcky” taken off the site."),
                arguments("DELETE_PROJECT", "Projekt " + ID + " „doucovani“ smazán; titulek „Doučování a školní pomůcky“",
                        "Projekt „Doučování a školní pomůcky“ smazán.",
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
        return Donor.register(PETR, DonorType.PERSON, "Petr Svoboda", null, new PostalAddress("Dlouhá 12", "Ústí nad Labem", "400 01"),
                new EmailAddress("petr@example.cz"), new PasswordHash("$hash"), new VariableSymbol("4821937560"), LocaleCode.CS, NOW);
    }

    private static Set<String> historyKeys(String resource) throws IOException {
        Properties properties = new Properties();
        try (Reader reader = new InputStreamReader(Objects.requireNonNull(AdminActionSummariesTest.class.getClassLoader().getResourceAsStream(resource)),
                StandardCharsets.UTF_8)) {
            properties.load(reader);
        }
        return properties.stringPropertyNames().stream().filter(key -> key.startsWith("admin.action.")).collect(Collectors.toSet());
    }

    private static ResourceBundleMessageSource messages() {
        ResourceBundleMessageSource messages = new ResourceBundleMessageSource();
        messages.setBasename("i18n/messages");
        messages.setDefaultEncoding("UTF-8");
        messages.setFallbackToSystemLocale(false);
        return messages;
    }
}

package cz.novanadeje.app.regression;

import cz.novanadeje.app.sharedcases.SharedCases;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

class BaselineHygieneTest {

    private static final String FIXTURE_SECRET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJ0123-_QQ";
    private static final BaselineHygiene.Fixtures NO_FIXTURES = new BaselineHygiene.Fixtures(Set.of(), Set.of());

    @ParameterizedTest
    @ValueSource(strings = {"regression", "shared-cases"})
    @DisplayName("Given a folder of public baseline artefacts, when it is scanned, then it holds files and none carries an id, a token or a foreign address")
    void should_hold_files_without_ids_tokens_or_foreign_addresses_when_a_public_artefact_folder_is_scanned(String folder) throws IOException {
        Path root = SharedCases.repositoryRoot().resolve(folder);

        BaselineHygiene.Report report = BaselineHygiene.scan(root, BaselineHygiene.fixtures(SharedCases.repositoryRoot().resolve("backend/src/test")));

        assertThat(report.filesScanned()).as("files in %s", folder).isPositive();
        assertThat(report.findings()).as("findings in %s", folder).isEmpty();
    }

    @Test
    @DisplayName("Given text with an id, an id in base64url, a JWT, a random secret, an unmasked cookie and an address no fixture uses, when it is checked, then each is reported")
    void should_report_each_leak_when_text_is_checked_given_planted_leaks() {
        String text = """
                {"id":"019a2b3c-4d5e-7f60-8a9b-0c1d2e3f4a5b", "userHandle":"bxwqO01eT2CKmwwdLj9KWw",
                 "authorization":"Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.c2lnbmF0dXJl",
                 "link":"https://nfnn.cz/heslo#q3Yb7xP0aZ9mN2kLw8RtUv5sC1dE4fGhJiKoMnBvCxZ",
                 "cookie":"refresh_token=abc; Path=/",
                 "to":"skutecny.clovek@seznam.cz", "known":"jana@example.cz", "built":"acme@example.cz"}
                """;

        List<String> findings = BaselineHygiene.findings("planted.json", text, new BaselineHygiene.Fixtures(Set.of("jana@example.cz"), Set.of()));

        assertThat(findings).hasSize(6)
                .anyMatch(finding -> finding.contains("an id 019a2b3c"))
                .anyMatch(finding -> finding.contains("an id in base64url bxwqO01e"))
                .anyMatch(finding -> finding.contains("JWT"))
                .anyMatch(finding -> finding.contains("random secret"))
                .anyMatch(finding -> finding.contains("cookie"))
                .anyMatch(finding -> finding.contains("skutecny.clovek@seznam.cz"));
    }

    @Test
    @DisplayName("Given masked placeholders, an IBAN, a hex digest, a secret the sources spell out, fixture addresses and addresses on an example domain, when text is checked, then nothing is reported")
    void should_report_nothing_when_text_is_checked_given_only_placeholders_and_public_values() {
        String text = "<id:1> <jwt> <token> <secret> refresh_token=<secret>; CZ2620100000005544332217 "
                + "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08 JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP jana@example.cz "
                + "nova-skola-pro-deti-z-o RECEIPT_SIGNATORY_NAME ScenarioTranscriptTest AesGcmSecretSealerTest ContactMessageRetentionSchedulerTest " + FIXTURE_SECRET + " jana3@example.cz Acme@Example.cz secret@photos.example";

        assertThat(BaselineHygiene.findings("clean.txt", text, new BaselineHygiene.Fixtures(Set.of("jana@example.cz"), Set.of(FIXTURE_SECRET)))).isEmpty();
    }

    @Test
    @DisplayName("Given an address on the deny list, when text is checked, then it is reported even though a test spells it out")
    void should_report_a_denied_address_when_text_is_checked_even_if_a_test_spells_it_out() {
        BaselineHygiene.Fixtures fixtures = new BaselineHygiene.Fixtures(Set.of("ucetni@stavby.cz"), Set.of());

        assertThat(BaselineHygiene.findings("totp.json", "{\"accountName\":\"Ucetni@stavby.cz\"}", fixtures))
                .singleElement().satisfies(finding -> assertThat(finding).contains("a denied address ucetni@stavby.cz"));
    }

    @Test
    @DisplayName("Given a setting whose name marks a secret, when a JSON file is checked, then an unmasked value is reported and a masked, empty or other one is not")
    void should_report_an_unmasked_secret_setting_when_a_json_file_is_checked() {
        String text = """
                {"settings":[{"name":"MAIL_PASSWORD","secret":true,"value":"xsmtpsib-key"},{"name":"FIO_TOKEN","value":"<secret>"},
                 {"name":"SETTINGS_KEY","value":null},{"name":"JWT_SECRET","value":""},{"name":"PUBLIC_URL","value":"http://localhost:4200"}],
                 "changes":[{"name":"SIGNING_KEY","value":"k"}]}
                """;

        List<String> findings = BaselineHygiene.findings("settings.json", text, NO_FIXTURES);

        assertThat(findings).hasSize(2).anyMatch(finding -> finding.contains("MAIL_PASSWORD")).anyMatch(finding -> finding.contains("SIGNING_KEY"));
    }

    @Test
    @DisplayName("Given a TOTP secret outside the test secrets and an unmasked secret parameter, when text is checked, then each is reported and the test secrets, also as a parameter, are not")
    void should_report_totp_secrets_and_unmasked_secret_parameters_when_text_is_checked() {
        String text = "otpauth://totp/x?secret=KRSXG5CTMVRXEZLUKN2XAZLSKNSWG4TF&issuer=y ONSWG4TFOQQGC3TEEBZWK4TWMVZCAMZT "
                + "otpauth://totp/y?secret=<secret> otpauth://totp/z?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=y "
                + String.join(" ", BaselineHygiene.TEST_TOTP_SECRETS);

        List<String> findings = BaselineHygiene.findings("totp.txt", text, NO_FIXTURES);

        assertThat(findings).hasSize(3)
                .anyMatch(finding -> finding.contains("an unmasked secret parameter"))
                .anyMatch(finding -> finding.contains("a TOTP secret starting KRSXG5CT"))
                .anyMatch(finding -> finding.contains("a TOTP secret starting ONSWG4TF"));
    }

    @Test
    @DisplayName("Given the surname of the foundation's people with diacritics, in capitals or broken by whitespace, when text is checked, then each is reported")
    void should_report_the_surname_family_when_text_is_checked_in_any_spelling() {
        String text = "Andrea Znamenáčková, PAVEL ZNAMENÁČEK, Zname\n  náček";

        assertThat(BaselineHygiene.findings("names.txt", text, NO_FIXTURES)).hasSize(3).allMatch(finding -> finding.contains("a real surname"));
    }

    @Test
    @DisplayName("Given a file that is not valid JSON among the JSON artefacts, when it is checked, then it is reported, so no rule can be skipped")
    void should_report_a_json_artefact_that_does_not_parse() {
        assertThat(BaselineHygiene.findings("broken.json", "{\"a\":", NO_FIXTURES)).anyMatch(finding -> finding.contains("not valid JSON"));
    }

    @Test
    @DisplayName("Given the test sources, when fixtures are collected, then they come only from them plus the foundation's address")
    void should_collect_fixtures_only_from_the_test_sources_plus_the_foundation_address(@TempDir Path testSources) throws IOException {
        Files.writeString(testSources.resolve("Fixture.java"), "\"jana@example.cz\" \"" + FIXTURE_SECRET + "\"");

        BaselineHygiene.Fixtures fixtures = BaselineHygiene.fixtures(testSources);

        assertThat(fixtures.addresses()).containsExactlyInAnyOrder("jana@example.cz", "info@nfnn.cz");
        assertThat(fixtures.values()).containsExactly(FIXTURE_SECRET);
    }

    @Test
    @DisplayName("Given the TOTP golden cases, when their secrets are read, then they are exactly the test secrets the hygiene scan allows")
    void should_allow_exactly_the_secrets_of_the_totp_golden_cases() throws IOException {
        JsonNode cases = JsonMapper.builder().build().readTree(SharedCases.repositoryRoot().resolve("shared-cases/totp/uri.json").toFile()).get("cases");

        assertThat(cases.valueStream().map(entry -> entry.get("input").get("secret").asString()).toList())
                .containsExactlyInAnyOrderElementsOf(BaselineHygiene.TEST_TOTP_SECRETS);
    }

    @Test
    @DisplayName("Given the backend tests, when fixtures are collected, then the fictional donors, the foundation's address and the secrets the tests spell out are among them")
    void should_collect_fictional_addresses_and_spelled_out_secrets_when_fixtures_are_collected() throws IOException {
        BaselineHygiene.Fixtures fixtures = BaselineHygiene.fixtures(SharedCases.repositoryRoot().resolve("backend/src/test"));

        assertThat(fixtures.addresses()).contains("info@nfnn.cz").anyMatch(address -> address.endsWith("@example.cz"));
        assertThat(fixtures.values()).contains(FIXTURE_SECRET);
    }
}

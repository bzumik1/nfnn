package cz.novanadeje.app.regression;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;

class BaselineHygieneTest {

    private static final String FIXTURE_SECRET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJ0123-_QQ";

    @ParameterizedTest
    @ValueSource(strings = {"regression", "shared-cases"})
    @DisplayName("Given a folder of public baseline artefacts, when it is scanned, then it holds files and none carries an id, a token or a foreign address")
    void should_hold_files_without_ids_tokens_or_foreign_addresses_when_a_public_artefact_folder_is_scanned(String folder) throws IOException {
        Path root = GoldenFiles.repositoryRoot().resolve(folder);

        BaselineHygiene.Report report = BaselineHygiene.scan(root, BaselineHygiene.fixtures(GoldenFiles.repositoryRoot().resolve("backend/src")));

        assertThat(report.filesScanned()).as("files in %s", folder).isPositive();
        assertThat(report.findings()).as("findings in %s", folder).isEmpty();
    }

    @ParameterizedTest
    @ValueSource(strings = {"regression", "shared-cases"})
    @DisplayName("Given the name of the foundation's real signatory, the production default of the receipts, when a folder of public baseline artefacts is scanned, then it appears in no file")
    void should_find_the_real_signatory_in_no_file_when_a_public_artefact_folder_is_scanned(String folder) throws IOException {
        String applicationYml = Files.readString(GoldenFiles.repositoryRoot().resolve("backend/src/main/resources/application.yml"), StandardCharsets.UTF_8);
        Matcher signatory = Pattern.compile("signatory-name: \\$\\{RECEIPT_SIGNATORY_NAME:([^}]+)}").matcher(applicationYml);
        assertThat(signatory.find()).as("the signatory's default in application.yml").isTrue();

        try (Stream<Path> files = Files.walk(GoldenFiles.repositoryRoot().resolve(folder))) {
            assertThat(files.filter(Files::isRegularFile).filter(file -> read(file).contains(signatory.group(1))).map(Path::toString))
                    .as("files naming the real signatory").isEmpty();
        }
    }

    private static String read(Path file) {
        try {
            return Files.readString(file, StandardCharsets.UTF_8);
        } catch (IOException unreadable) {
            throw new UncheckedIOException(unreadable);
        }
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

        assertThat(BaselineHygiene.findings("clean.json", text, new BaselineHygiene.Fixtures(Set.of("jana@example.cz"), Set.of(FIXTURE_SECRET)))).isEmpty();
    }

    @Test
    @DisplayName("Given the backend sources, when fixtures are collected, then the fictional donors, the foundation's address and the secrets the tests spell out are among them")
    void should_collect_fictional_addresses_and_spelled_out_secrets_when_fixtures_are_collected() throws IOException {
        BaselineHygiene.Fixtures fixtures = BaselineHygiene.fixtures(GoldenFiles.repositoryRoot().resolve("backend/src"));

        assertThat(fixtures.addresses()).contains("info@nfnn.cz").anyMatch(address -> address.endsWith("@example.cz"));
        assertThat(fixtures.values()).contains(FIXTURE_SECRET);
    }
}

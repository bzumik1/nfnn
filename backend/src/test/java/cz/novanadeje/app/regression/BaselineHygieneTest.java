package cz.novanadeje.app.regression;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.io.IOException;
import java.nio.file.Path;
import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

class BaselineHygieneTest {

    @ParameterizedTest
    @ValueSource(strings = {"regression", "shared-cases"})
    @DisplayName("Given a folder of public baseline artefacts, when it is scanned, then it holds files and none carries an id, a token or a foreign address")
    void should_hold_files_without_ids_tokens_or_foreign_addresses_when_a_public_artefact_folder_is_scanned(String folder) throws IOException {
        Path root = GoldenFiles.repositoryRoot().resolve(folder);

        BaselineHygiene.Report report = BaselineHygiene.scan(root, BaselineHygiene.fixtureAddresses(GoldenFiles.repositoryRoot().resolve("backend/src")));

        assertThat(report.filesScanned()).as("files in %s", folder).isPositive();
        assertThat(report.findings()).as("findings in %s", folder).isEmpty();
    }

    @Test
    @DisplayName("Given text with an id, a JWT, a random secret, an unmasked cookie and an address no fixture uses, when it is checked, then each is reported")
    void should_report_each_leak_when_text_is_checked_given_planted_leaks() {
        String text = """
                {"id":"019a2b3c-4d5e-7f60-8a9b-0c1d2e3f4a5b",
                 "authorization":"Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.c2lnbmF0dXJl",
                 "link":"https://nfnn.cz/heslo#q3Yb7xP0aZ9mN2kLw8RtUv5sC1dE4fGhJiKoMnBvCxZ",
                 "cookie":"refresh_token=abc; Path=/",
                 "to":"skutecny.clovek@seznam.cz", "known":"jana@example.cz"}
                """;

        List<String> findings = BaselineHygiene.findings("planted.json", text, Set.of("jana@example.cz"));

        assertThat(findings).hasSize(5)
                .anyMatch(finding -> finding.contains("id"))
                .anyMatch(finding -> finding.contains("JWT"))
                .anyMatch(finding -> finding.contains("random secret"))
                .anyMatch(finding -> finding.contains("cookie"))
                .anyMatch(finding -> finding.contains("skutecny.clovek@seznam.cz"));
    }

    @Test
    @DisplayName("Given masked placeholders, an IBAN, a hex digest and fixture addresses, when text is checked, then nothing is reported")
    void should_report_nothing_when_text_is_checked_given_only_placeholders_and_public_values() {
        String text = "<id:1> <jwt> <token> <secret> refresh_token=<secret>; CZ2620100000005544332217 "
                + "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08 JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP jana@example.cz";

        assertThat(BaselineHygiene.findings("clean.json", text, Set.of("jana@example.cz"))).isEmpty();
    }

    @Test
    @DisplayName("Given the backend sources, when fixture addresses are collected, then the fictional donors and the foundation's address are among them")
    void should_collect_fictional_and_foundation_addresses_when_fixture_addresses_are_collected() throws IOException {
        Set<String> addresses = BaselineHygiene.fixtureAddresses(GoldenFiles.repositoryRoot().resolve("backend/src"));

        assertThat(addresses).contains("info@nfnn.cz").anyMatch(address -> address.endsWith("@example.cz"));
    }
}

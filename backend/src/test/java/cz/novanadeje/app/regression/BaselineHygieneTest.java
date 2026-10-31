package cz.novanadeje.app.regression;

import cz.novanadeje.app.operations.domain.backup.BackupKey;
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
import java.util.Locale;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

class BaselineHygieneTest {

    private static final String FIXTURE_SECRET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJ0123-_QQ";
    private static final String TEST_BACKUP_KEY = "AGE-SECRET-KEY-1R45A984EXXAFC85YZSYGY9R6XJTD4E9AKY65ZCRGPDQ89E7ANW8QKT6GWH";
    private static final String OTHER_BACKUP_KEY = "AGE-SECRET-KEY-1ARXU2VF0GAFA8YLTUXNPDZE0UV33WNCJJEUWM3C2RKSR7A829JTS8HRKXT";
    private static final String V2_RECEIPT_TEMPLATE_DIGEST = "7b30974aef2fdaf01f6e4990c8c4b526a0de8d8371452023be783677b69bf7e7";
    private static final JsonMapper RECEIPT_CORPUS_JSON = JsonMapper.builder().build();
    private static final BaselineHygiene.Fixtures NO_FIXTURES = new BaselineHygiene.Fixtures(Set.of(), Set.of());

    @ParameterizedTest
    @ValueSource(strings = {"regression", "shared-cases"})
    @DisplayName("Given a folder of public baseline artefacts, when it is scanned, then it holds files and none carries an id, a token or a foreign address")
    void should_hold_files_without_ids_tokens_or_foreign_addresses_when_a_public_artefact_folder_is_scanned(String folder) throws IOException {
        Path root = SharedCases.repositoryRoot().resolve(folder);

        BaselineHygiene.Report report = BaselineHygiene.scan(root, BaselineHygiene.fixtures(SharedCases.repositoryRoot().resolve("backend/src/test"),
                SharedCases.repositoryRoot().resolve("test-cases")));

        assertThat(report.filesScanned()).as("files in %s", folder).isPositive();
        assertThat(report.findings()).as("findings in %s", folder).isEmpty();
    }

    @Test
    @DisplayName("Given v2's receipt corpus, when the template each sample names is read, then it is the one public bundle v2 issued from, which its retired history test spelled out until slice 1.10")
    void should_name_the_one_public_template_bundle_when_read_given_v2_receipt_corpus() throws IOException {
        Path corpus = SharedCases.repositoryRoot().resolve("regression/v2/receipts");
        List<Path> samples;
        try (var files = Files.list(corpus)) {
            samples = files.filter(file -> file.getFileName().toString().endsWith(".json"))
                    .filter(file -> !Set.of("digests.json", "refusals.json").contains(file.getFileName().toString()))
                    .sorted().toList();
        }

        assertThat(samples).isNotEmpty();
        for (Path sample : samples) {
            JsonNode receipt = RECEIPT_CORPUS_JSON.readTree(Files.readString(sample));
            assertThat(receipt.findValue("template").asString()).as("template of %s", sample.getFileName()).isEqualTo(V2_RECEIPT_TEMPLATE_DIGEST);
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
                + "\"sha256\":\"9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08\" JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP jana@example.cz "
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
        String text = "Bohdana Znamenáčková, RADIM ZNAMENÁČEK, Zname\n  náček";

        assertThat(BaselineHygiene.findings("names.txt", text, NO_FIXTURES)).hasSize(3).allMatch(finding -> finding.contains("a real surname"));
    }

    @Test
    @DisplayName("Given a backup key other than the dev default key, when text is checked, then it is reported in any case, and the dev key and the keys the tests spell out are not")
    void should_report_a_backup_key_other_than_the_dev_key_when_text_is_checked() {
        String text = OTHER_BACKUP_KEY + " " + OTHER_BACKUP_KEY.toLowerCase(Locale.ROOT) + " " + BaselineHygiene.DEV_BACKUP_KEY + " "
                + BaselineHygiene.DEV_BACKUP_KEY.toLowerCase(Locale.ROOT) + " " + TEST_BACKUP_KEY + " Klíč začíná AGE-SECRET-KEY-1 a má 74 znaků";

        List<String> findings = BaselineHygiene.findings("keys.txt", text, new BaselineHygiene.Fixtures(Set.of(), Set.of(TEST_BACKUP_KEY)));

        assertThat(findings).hasSize(2).allMatch(finding -> finding.contains("a backup key starting AGE-SECR"));
    }

    @Test
    @DisplayName("Given backup key words in a confirmation, a first setup and a list, when a JSON file is checked, then a word of another key is reported, and masked words, words of the dev key and words the features spell out are not")
    void should_report_backup_key_words_of_another_key_when_a_json_file_is_checked() {
        List<String> devWords = new BackupKey(BaselineHygiene.DEV_BACKUP_KEY).words();
        List<String> foreign = new BackupKey(OTHER_BACKUP_KEY).words().stream().filter(word -> !devWords.contains(word)).limit(2).toList();
        String text = """
                {"words":[{"position":1,"word":"<secret>"},{"position":2,"word":"%s"},{"position":3,"word":"%s"},{"position":4,"word":"abeceda"}],
                 "backupKeyWords":[{"position":5,"word":"%s"}],"list":{"words":["%s","<secret>"]}}
                """.formatted(devWords.get(1).toUpperCase(Locale.ROOT), foreign.get(0), devWords.get(4), foreign.get(1));

        List<String> findings = BaselineHygiene.findings("words.json", text, new BaselineHygiene.Fixtures(Set.of(), Set.of(), Set.of("abeceda")));

        assertThat(findings).hasSize(2).allMatch(finding -> finding.contains("an unmasked backup key word"));
    }

    @Test
    @DisplayName("Given the dev default backup key the hygiene allows, when the dev configuration is read, then it is the key application-dev.yml falls back to")
    void should_allow_exactly_the_dev_default_backup_key_when_the_dev_configuration_is_read() throws IOException {
        String devConfiguration = Files.readString(SharedCases.repositoryRoot().resolve("backend/src/main/resources/application-dev.yml"));

        assertThat(devConfiguration).contains("${BACKUP_KEY:" + BaselineHygiene.DEV_BACKUP_KEY + "}");
    }

    @Test
    @DisplayName("Given BCrypt hashes of each variant, when text is checked, then each is reported")
    void should_report_bcrypt_hashes_when_text_is_checked() {
        String hash = "abcdefghijklmnopqrstuv" + "ABCDEFGHIJKLMNOPQRSTUVWXYZ01234";
        String text = "$2a$10$" + hash + " \"$2b$12$" + hash + "\" $2y$04$" + hash.replace('a', '.') + " $2a$ alone";

        assertThat(BaselineHygiene.findings("hashes.txt", text, NO_FIXTURES)).hasSize(3).allMatch(finding -> finding.contains("a BCrypt hash"));
    }

    @Test
    @DisplayName("Given lowercase hex of 32 characters and more, when text is checked, then a bare one or one in another field is reported, and labelled digests, QR rows, one repeated letter, the baseline commit and values the tests spell out are not")
    void should_report_hex_secrets_outside_digests_when_text_is_checked() {
        String secret = "3f2a9c41d07be65f8a1c29e0b4d7f3a6";
        String spelled = "0a1b2c3d4e5f60718293a4b5c6d7e8f9";
        String digest = "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";
        String text = """
                {"seed":"%s", "sha256":"%s", "pixelsSha256": "%s", "image":"<data:image/png size=12 sha256=%s>",
                 "modules":"0101101001011010010110100101101001", "name":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "fixture":"%s"} %s
                """.formatted(secret, digest, digest, digest, spelled, secret.substring(4) + "77abcd");

        List<String> findings = BaselineHygiene.findings("hex.txt", text, new BaselineHygiene.Fixtures(Set.of(), Set.of(spelled)));

        assertThat(findings).hasSize(2).allMatch(finding -> finding.contains("a hex secret starting"));
        assertThat(BaselineHygiene.findings("v2/BASELINE_COMMIT", "0123456789abcdef0123456789abcdef01234567\n", NO_FIXTURES)).isEmpty();
    }

    @Test
    @DisplayName("Given the seeds of RFC 8032, the dev default and the prod test in hex, base64 or base64url, when text is checked, then each is reported as a signing seed even though the tests spell them out")
    void should_report_signing_seeds_when_text_is_checked_given_rfc_and_dev_seeds_spelled_out_by_tests() {
        String hex = "9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60";
        String base64 = "nWGxne/9WmC6hEr0kuwsxERJxWl7MmkZcDusAxyuf2A=";
        String otherHex = "4ccd089b28ff96da9db6c346ec114e0f5b8a319f35aba624da8cf6ed4fb8a6fb";
        String oddXHex = "833fe62409237b9d62ec77587520911e9a759cec1d19755b7da901b96dca3d42";
        String prodTestBase64 = "bmZubi1wcm9kLXRlc3Qtc2VlZC1ub3QtcmZjLTgwMzI=";
        String test3Hex = "c5aa8df43f9f837bedb7442f31dcb7b166d38535076f094b85ce3a2e0b4458f7";
        String test1024Base64 = "9eV2fPFTMZUXYw8iaHa4bIFgzFg7wBN0TGvyVfXMDuU=";
        String text = "dev %s, upper %s, base64url %s, test 2 %s, test SHA(abc) %s, prod test %s, test 3 %s, test 1024 %s".formatted(base64,
                hex.toUpperCase(Locale.ROOT), "nWGxne_9WmC6hEr0kuwsxERJxWl7MmkZcDusAxyuf2A", otherHex, oddXHex, prodTestBase64, test3Hex, test1024Base64);
        BaselineHygiene.Fixtures spelled = new BaselineHygiene.Fixtures(Set.of(), Set.of(hex, base64, otherHex, hex.toUpperCase(Locale.ROOT),
                "nWGxne_9WmC6hEr0kuwsxERJxWl7MmkZcDusAxyuf2A", oddXHex, prodTestBase64, test3Hex, test1024Base64));

        List<String> findings = BaselineHygiene.findings("seeds.txt", text, spelled);

        assertThat(findings).filteredOn(finding -> finding.contains("a receipt signing seed")).hasSize(8);
    }

    @Test
    @DisplayName("Given JSON fields named after a seed, a signing key or a private key, when a JSON file is checked, then a value other than <secret> or empty is reported and the public key is not")
    void should_report_unmasked_seed_fields_when_a_json_file_is_checked() {
        String text = """
                {"seed":"planted", "receipt":{"signingKey":"planted", "privateKeyHex":"planted", "seedBase64":"<secret>", "publicKeyHex":"planted", "signingKeyId":"21fe31df"}}
                """;

        List<String> findings = BaselineHygiene.findings("keys.json", text, NO_FIXTURES);

        assertThat(findings).containsExactlyInAnyOrder("keys.json: an unmasked signing key field seed", "keys.json: an unmasked signing key field signingKey",
                "keys.json: an unmasked signing key field privateKeyHex");
    }

    @Test
    @DisplayName("Given proof hex labelled payloadHex, signatureHex or publicKeyHex and a proof text with a stray letter, when a verification case file is checked, then they are not reported, and the same hex unlabelled or in another folder is")
    void should_allow_labelled_proof_hex_only_in_verification_cases_when_text_is_checked() {
        String hex = "3f2a9c41d07be65f8a1c29e0b4d7f3a6";
        String labelled = """
                {"payloadHex":"%s", "signatureHex": "%s", "keys":[{"publicKeyHex":"%s"}], "qrText": "https://nfnn.cz/overit#%s"}
                """.formatted(hex, hex, hex, hex);

        assertThat(BaselineHygiene.findings("verification/payload.json", labelled, NO_FIXTURES)).isEmpty();
        assertThat(BaselineHygiene.findings("verification/payload.json", "{\"other\":\"" + hex + "\"}", NO_FIXTURES))
                .singleElement().asString().contains("a hex secret starting 3f2a9c41");
        assertThat(BaselineHygiene.findings("qr/payment.json", labelled, NO_FIXTURES)).hasSize(4).allMatch(finding -> finding.contains("a hex secret starting"));
    }

    @Test
    @DisplayName("Given a baseline folder whose BASELINE_COMMIT names a commit, when it is scanned, then a changes file naming that commit is clean and another commit in it is still reported")
    void should_allow_the_baseline_commit_in_other_files_when_a_folder_is_scanned(@TempDir Path temporary) throws IOException {
        Path root = temporary.resolve("regression");
        String baseline = "c4a256c2912b03c8fc9609ec1fc2e342774c31e5";
        String other = "797db519f82975f9dab4b31b199e34bd9e527db5";
        Files.createDirectories(root.resolve("v2/changes"));
        Files.writeString(root.resolve("v2/BASELINE_COMMIT"), baseline + "\n");
        Files.writeString(root.resolve("v2/changes/0.6c.json"), """
                {"recordedFrom":"%s", "record":"node scripts/compare-screens.mjs --base=%s", "other":"%s"}
                """.formatted(baseline, baseline, other));

        BaselineHygiene.Report report = BaselineHygiene.scan(root, NO_FIXTURES);

        assertThat(report.findings()).containsExactly("v2/changes/0.6c.json: a hex secret starting 797db519");
    }

    @Test
    @DisplayName("Given a second BASELINE_COMMIT beside the anchored one, a file whose name only ends so and a v2/BASELINE_COMMIT in the shared cases, when the folders are scanned, then the ids they hold are still reported, in those files and where other files name them")
    void should_trust_only_the_anchored_baseline_commit_when_a_folder_is_scanned_given_planted_commit_files(@TempDir Path temporary) throws IOException {
        Path regression = temporary.resolve("regression");
        Path sharedCases = temporary.resolve("shared-cases");
        String baseline = "c4a256c2912b03c8fc9609ec1fc2e342774c31e5";
        String planted = "797db519f82975f9dab4b31b199e34bd9e527db5";
        String renamed = "655dd631a1b2c3d4e5f60718293a4b5c6d7e8f90";
        Files.createDirectories(regression.resolve("v2/changes"));
        Files.createDirectories(regression.resolve("v3"));
        Files.createDirectories(sharedCases.resolve("v2"));
        Files.writeString(regression.resolve("v2/BASELINE_COMMIT"), baseline + "\n");
        Files.writeString(regression.resolve("v3/BASELINE_COMMIT"), planted + "\n");
        Files.writeString(regression.resolve("v2/xBASELINE_COMMIT"), renamed + "\n");
        Files.writeString(regression.resolve("v2/changes/planted.json"), """
                {"recordedFrom":"%s", "planted":"%s", "renamed":"%s"}
                """.formatted(baseline, planted, renamed));
        Files.writeString(sharedCases.resolve("v2/BASELINE_COMMIT"), planted + "\n");

        BaselineHygiene.Report inRegression = BaselineHygiene.scan(regression, NO_FIXTURES);
        BaselineHygiene.Report inSharedCases = BaselineHygiene.scan(sharedCases, NO_FIXTURES);

        assertThat(inRegression.findings()).containsExactlyInAnyOrder(
                "v2/changes/planted.json: a hex secret starting 797db519",
                "v2/changes/planted.json: a hex secret starting 655dd631",
                "v3/BASELINE_COMMIT: a hex secret starting 797db519",
                "v2/xBASELINE_COMMIT: a hex secret starting 655dd631");
        assertThat(inSharedCases.findings()).containsExactly("v2/BASELINE_COMMIT: a hex secret starting 797db519");
    }

    @Test
    @DisplayName("Given upper-case hex of 32 characters and more, when text is checked, then it is reported, and an upper-case labelled digest and a value the tests spell out are not")
    void should_report_upper_case_hex_secrets_when_text_is_checked() {
        String text = """
                {"seed":"3F2A9C41D07BE65F8A1C29E0B4D7F3A6", "sha256":"9F86D081884C7D659A2FEAA0C55AD015A3BF4F1B2B0B822CD15D6C15B0F00A08",
                 "fixture":"0A1B2C3D4E5F60718293A4B5C6D7E8F9", "name":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"}
                """;

        List<String> findings = BaselineHygiene.findings("hex.txt", text, new BaselineHygiene.Fixtures(Set.of(), Set.of("0A1B2C3D4E5F60718293A4B5C6D7E8F9")));

        assertThat(findings).singleElement().satisfies(finding -> assertThat(finding).contains("a hex secret starting 3F2A9C41"));
    }

    @Test
    @DisplayName("Given standard base64 of 32 characters and more, when text is checked, then it is reported, and paths, plain words and values the tests spell out are not")
    void should_report_standard_base64_secrets_when_text_is_checked() {
        String padded = "c2VjcmV0LW9mLXRoaXJ0eS10d28tYnl0ZXMtIQ==";
        String slashed = "k9Jw2+Qx7Lm/Vb4Tz8Rc1Hn6Yd3Fp0Gs5AeKu";
        String spelled = "ZGV2LW9ubHktc2V0dGluZ3Mta2V5LTMyLWJ5dGVzLSE=";
        String text = padded + " \"" + slashed + "\" " + spelled + " /api/admin/operations/backups/key/confirmation https://nfnn.cz/Novinky/Den2026/Program";

        List<String> findings = BaselineHygiene.findings("base64.txt", text, new BaselineHygiene.Fixtures(Set.of(), Set.of(spelled)));

        assertThat(findings).hasSize(2).allMatch(finding -> finding.contains("a base64 secret starting"));
    }

    @Test
    @DisplayName("Given a recovery code and a setup code, written plain or grouped, when text is checked, then each is reported, and their masked slots, a recovery code the tests spell out, digits and capital words are not")
    void should_report_recovery_and_setup_codes_when_text_is_checked() {
        String text = "OBNOVA-DHG6-6PK2 OBNOVA DHG66PK2 OBNOVA-<recovery-code> Dar OBNOVA ABCD 2345 K7MP-Q2XR-9HTD K7MPQ2XR9HTD <setup-code> 234567892345 "
                + "PASSWORDLESS RECEIPT_FIRST_YEAR";

        List<String> findings = BaselineHygiene.findings("codes.txt", text, new BaselineHygiene.Fixtures(Set.of(), Set.of("ABCD2345")));

        assertThat(findings).hasSize(4);
        assertThat(findings).filteredOn(finding -> finding.contains("a recovery code")).hasSize(2);
        assertThat(findings).filteredOn(finding -> finding.contains("a setup code")).hasSize(2);
    }

    @Test
    @DisplayName("Given IBANs and account numbers, when text is checked, then those outside the foundation's account, the ISO examples and the test fixtures are reported, and a law's number is not")
    void should_report_ibans_and_accounts_outside_the_allow_list_when_text_is_checked() {
        String text = "CZ5527000000001234567890 \"CZ94 5500 0000 0010 1103 8930\" " + BaselineHygiene.FOUNDATION_IBAN
                + " DE89370400440532013000 CZ6508000000192000145399 CZ0308000000002900233333 "
                + "2900255555/0100 \"19-2900266666/0300\" " + BaselineHygiene.FOUNDATION_ACCOUNT + " 2900233333/2010 zákon č. 586/1992 Sb.";

        List<String> findings = BaselineHygiene.findings("accounts.txt", text,
                new BaselineHygiene.Fixtures(Set.of(), Set.of("CZ0308000000002900233333", "2900233333/2010")));

        assertThat(findings).hasSize(3)
                .anyMatch(finding -> finding.contains("an IBAN starting CZ552700"))
                .anyMatch(finding -> finding.contains("an account number ending /0100"))
                .anyMatch(finding -> finding.contains("an account number ending /0300"));
    }

    @Test
    @DisplayName("Given the foundation's account the hygiene allows, when the configuration is read, then it is the account and IBAN application.yml falls back to")
    void should_allow_exactly_the_foundation_account_when_the_configuration_is_read() throws IOException {
        String configuration = Files.readString(SharedCases.repositoryRoot().resolve("backend/src/main/resources/application.yml"));

        assertThat(configuration).contains("${BANK_ACCOUNT_NUMBER:" + BaselineHygiene.FOUNDATION_ACCOUNT + "}")
                .contains("${BANK_IBAN:" + BaselineHygiene.FOUNDATION_IBAN + "}");
    }

    @Test
    @DisplayName("Given the test sources, when fixtures are collected, then accounts, IBANs, standard base64 and recovery codes the tests spell out, the accounts of feature tables and the words the features quote are among them")
    void should_collect_accounts_ibans_base64_and_feature_words_when_fixtures_are_collected(@TempDir Path testSources) throws IOException {
        Files.writeString(testSources.resolve("Accounts.java"), "\"2900277777/0800\" \"CZ0308000000002900233333\" \"c2VjcmV0LW9mLXRoaXJ0eS10d28tYnl0ZXMtIQ==\" \"ignored\"");
        Files.writeString(testSources.resolve("backup_key.feature"), "When \"Jana\" confirms the backup key with the words \"abeceda\" and \"vlak\" at 1 and 2\n"
                + "  | 1003 | 2026-10-12 | 250.00 | 2900288888 | 0800 | Svoboda Karel |\nThen the message \"OBNOVA DHG6 6PK2\" pairs");

        BaselineHygiene.Fixtures fixtures = BaselineHygiene.fixtures(testSources);

        assertThat(fixtures.values()).contains("2900277777/0800", "CZ0308000000002900233333", "c2VjcmV0LW9mLXRoaXJ0eS10d28tYnl0ZXMtIQ==",
                "2900288888/0800", "DHG66PK2");
        assertThat(fixtures.words()).contains("abeceda", "vlak").doesNotContain("ignored");
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

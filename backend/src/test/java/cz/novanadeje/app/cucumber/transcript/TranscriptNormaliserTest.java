package cz.novanadeje.app.cucumber.transcript;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.nio.ByteBuffer;
import java.util.Base64;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class TranscriptNormaliserTest {

    private static final String FIRST_ID = "019a2b3c-4d5e-7f60-8a9b-0c1d2e3f4a5b";
    private static final String SECOND_ID = "019a2b3c-4d5e-7f60-8a9b-0c1d2e3f4a5c";
    private static final String JWT = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.c2lnbmF0dXJlLXZhbHVlLWhlcmU";
    private static final String LINK_SECRET = "q3Yb7xP0aZ9mN2kLw8RtUv5sC1dE4fGhJiKoMnBvCxZ";

    private final JsonMapper json = JsonMapper.builder().build();

    @Test
    @DisplayName("Given two ids, when text is normalised, then each id becomes a number by first appearance, whatever its case")
    void should_number_ids_by_first_appearance_when_text_is_normalised_given_two_ids() {
        TranscriptNormaliser normaliser = new TranscriptNormaliser(Map.of());

        String normalised = normaliser.text(SECOND_ID + " " + FIRST_ID + " " + SECOND_ID.toUpperCase());

        assertThat(normalised).isEqualTo("<id:1> <id:2> <id:1>");
    }

    @Test
    @DisplayName("Given an id seen in a path, when it appears later in a body, then it keeps its number")
    void should_keep_the_number_of_an_id_when_it_appears_later_in_a_body_given_it_was_seen_in_a_path() {
        TranscriptNormaliser normaliser = new TranscriptNormaliser(Map.of());
        normaliser.path("/api/admin/donors/" + FIRST_ID);

        JsonNode body = normaliser.json(json.readTree("{\"id\":\"" + FIRST_ID + "\",\"other\":\"" + SECOND_ID + "\"}"));

        assertThat(body.toString()).isEqualTo("{\"id\":\"<id:1>\",\"other\":\"<id:2>\"}");
    }

    @Test
    @DisplayName("Given a JWT and a random link secret in a sentence, when it is normalised, then both are masked")
    void should_mask_jwt_and_random_secrets_when_text_is_normalised_given_a_sentence_with_both() {
        TranscriptNormaliser normaliser = new TranscriptNormaliser(Map.of());

        String normalised = normaliser.text("Bearer " + JWT + " and https://nfnn.cz/heslo#" + LINK_SECRET);

        assertThat(normalised).isEqualTo("Bearer <jwt> and https://nfnn.cz/heslo#<token>");
    }

    @Test
    @DisplayName("Given an IBAN, a SHA-256 in hex and a slug, when text is normalised, then they stay as they are")
    void should_keep_iban_hex_digest_and_slug_when_text_is_normalised() {
        TranscriptNormaliser normaliser = new TranscriptNormaliser(Map.of());
        String text = "CZ2620100000005544332217 9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08 nova-skola-pro-deti-z-okoli-tisnova";

        assertThat(normaliser.text(text)).isEqualTo(text);
    }

    @Test
    @DisplayName("Given known random values, when text is normalised, then only whole occurrences become their labels")
    void should_replace_only_whole_occurrences_when_text_is_normalised_given_known_random_values() {
        TranscriptNormaliser normaliser = new TranscriptNormaliser(Map.of("4815162342", "<vs:Jana>"));

        String normalised = normaliser.text("SPD*1.0*X-VS:4815162342*AM:500.00 and 48151623420");

        assertThat(normalised).isEqualTo("SPD*1.0*X-VS:<vs:Jana>*AM:500.00 and 48151623420");
    }

    @Test
    @DisplayName("Given known values with a numbered label, when they appear, then each gets its number by first appearance")
    void should_number_known_values_by_first_appearance_when_they_appear_given_a_numbered_label() {
        TranscriptNormaliser normaliser = new TranscriptNormaliser(Map.of("1111111111", "<vs:#>", "2222222222", "<vs:#>"));

        String normalised = normaliser.text("2222222222, 1111111111, 2222222222");

        assertThat(normalised).isEqualTo("<vs:1>, <vs:2>, <vs:1>");
    }

    @Test
    @DisplayName("Given a donor's id written as base64url in a passkey's user handle and in the options' user id, when a body is normalised, then both are numbered like the id itself")
    void should_number_base64url_ids_like_the_id_itself_when_a_body_is_normalised_given_passkey_user_handles() {
        TranscriptNormaliser normaliser = new TranscriptNormaliser(Map.of());
        normaliser.text(FIRST_ID);

        JsonNode body = normaliser.json(json.readTree("{\"user\":{\"id\":\"" + base64Url(FIRST_ID) + "\"},\"response\":{\"userHandle\":\"" + base64Url(FIRST_ID) + "\"}}"));

        assertThat(body.toString()).isEqualTo("{\"user\":{\"id\":\"<id:1>\"},\"response\":{\"userHandle\":\"<id:1>\"}}");
    }

    @Test
    @DisplayName("Given a random id written as base64url, as a foreign passkey's user handle is, when a body is normalised, then it is numbered as an id")
    void should_number_a_random_base64url_user_handle_when_a_body_is_normalised() {
        TranscriptNormaliser normaliser = new TranscriptNormaliser(Map.of());

        assertThat(normaliser.json(json.readTree("{\"userHandle\":\"" + base64Url("6f1c2a3b-4d5e-4f60-8a9b-0c1d2e3f4a5b") + "\"}")).toString())
                .isEqualTo("{\"userHandle\":\"<id:1>\"}");
    }

    @Test
    @DisplayName("Given names of 22 letters that decode like an id and long CamelCase names, when text is normalised, then they stay as they are")
    void should_keep_names_that_decode_like_an_id_when_text_is_normalised() {
        TranscriptNormaliser normaliser = new TranscriptNormaliser(Map.of());
        String text = "ScenarioTranscriptTest AesGcmSecretSealerTest RECEIPT_SIGNATORY_NAME ContactMessageRetentionSchedulerTest shouldRejectEveryUnknownConnectedApplication";

        assertThat(normaliser.text(text)).isEqualTo(text);
    }

    @Test
    @DisplayName("Given a known value typed in lowercase, when text is normalised, then it is still replaced")
    void should_replace_a_known_value_in_any_case_when_text_is_normalised() {
        TranscriptNormaliser normaliser = new TranscriptNormaliser(Map.of("HPNN-QW32-5QVD", "<setup-code>"));

        assertThat(normaliser.text("code hpnn-qw32-5qvd")).isEqualTo("code <setup-code>");
    }

    @Test
    @DisplayName("Given a second-factor recovery message, when text is normalised, then the random code goes and the word stays")
    void should_mask_the_recovery_code_and_keep_the_word_when_text_is_normalised() {
        TranscriptNormaliser normaliser = new TranscriptNormaliser(Map.of());

        assertThat(normaliser.text("Zpráva pro příjemce: OBNOVA DHG66PK2, nebo OBNOVA RFFT WBF9")).isEqualTo("Zpráva pro příjemce: OBNOVA <recovery-code>, nebo OBNOVA <recovery-code>");
    }

    @Test
    @DisplayName("Given a field whose name ends with code and holds six digits, when a body is normalised, then the value is masked")
    void should_mask_six_digit_codes_when_a_body_is_normalised_given_a_field_ending_with_code() {
        TranscriptNormaliser normaliser = new TranscriptNormaliser(Map.of());

        assertThat(normaliser.json(json.readTree("{\"secondFactorCode\":\"575581\",\"postalCode\":\"400 01\"}")).toString())
                .isEqualTo("{\"secondFactorCode\":\"<secret>\",\"postalCode\":\"400 01\"}");
    }

    @Test
    @DisplayName("Given secret fields, when a body is normalised, then their values are masked and the shape stays")
    void should_mask_values_and_keep_the_shape_when_a_body_is_normalised_given_secret_fields() {
        TranscriptNormaliser normaliser = new TranscriptNormaliser(Map.of());
        JsonNode raw = json.readTree("""
                {"email":"jana@example.cz","password":"Heslo-12345","secret":"JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP",
                 "otpauthUri":"otpauth://totp/x","qrCode":{"size":21,"modules":"0101"},"recoveryCodes":["A","B"],
                 "accessToken":"x","code":"123456","nested":{"refreshToken":null}}
                """);

        JsonNode normalised = normaliser.json(raw);

        assertThat(normalised.toString()).isEqualTo("""
                {"email":"jana@example.cz","password":"<secret>","secret":"<secret>","otpauthUri":"<secret>",\
                "qrCode":{"size":"<secret>","modules":"<secret>"},"recoveryCodes":["<secret>","<secret>"],\
                "accessToken":"<secret>","code":"<secret>","nested":{"refreshToken":null}}""");
    }

    @Test
    @DisplayName("Given settings whose names mark a secret, when a body is normalised, then their values are masked, the boolean secret flag stays and other values stay")
    void should_mask_values_of_secret_settings_and_keep_the_flag_when_a_body_is_normalised() {
        TranscriptNormaliser normaliser = new TranscriptNormaliser(Map.of());
        JsonNode raw = json.readTree("""
                {"items":[{"name":"MAIL_PASSWORD","secret":true,"value":"xsmtpsib-key"},{"name":"FIO_TOKEN","secret":true,"value":"fio-read-only-token"},
                 {"name":"SIGNING_KEY","value":"k"},{"name":"CLIENT_SECRET","value":"s"},{"name":"PUBLIC_URL","secret":false,"value":"http://localhost:4200"},
                 {"name":"MAIL_PASSWORD","value":null}]}
                """);

        assertThat(normaliser.json(raw).toString()).isEqualTo("""
                {"items":[{"name":"MAIL_PASSWORD","secret":true,"value":"<secret>"},{"name":"FIO_TOKEN","secret":true,"value":"<secret>"},\
                {"name":"SIGNING_KEY","value":"<secret>"},{"name":"CLIENT_SECRET","value":"<secret>"},\
                {"name":"PUBLIC_URL","secret":false,"value":"http://localhost:4200"},{"name":"MAIL_PASSWORD","value":null}]}""");
    }

    @Test
    @DisplayName("Given an image as a data URI, when text is normalised, then it becomes its type, size and SHA-256")
    void should_describe_an_image_data_uri_by_type_size_and_digest_when_text_is_normalised() {
        TranscriptNormaliser normaliser = new TranscriptNormaliser(Map.of());

        assertThat(normaliser.text("{\"image\":\"data:image/png;base64,aGVsbG8gd29ybGQ=\"}"))
                .isEqualTo("{\"image\":\"<data:image/png size=11 sha256=b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9>\"}");
    }

    @Test
    @DisplayName("Given secrets in fields, known values and recovery codes, when they are normalised, then each raw value is remembered for the leak check")
    void should_remember_every_masked_raw_value_when_normalised() {
        TranscriptNormaliser normaliser = new TranscriptNormaliser(Map.of("JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP", "<secret>"));

        normaliser.json(json.readTree("{\"password\":\"Heslo-12345\",\"changes\":[{\"name\":\"MAIL_PASSWORD\",\"value\":\"xsmtpsib-key\"}]}"));
        normaliser.text("OBNOVA DHG66PK2");

        assertThat(normaliser.maskedValues()).contains("Heslo-12345", "xsmtpsib-key", "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP", "DHG66PK2");
    }

    @Test
    @DisplayName("Given a payment QR without a TOTP URI beside it, when a body is normalised, then its modules are kept")
    void should_keep_payment_qr_modules_when_a_body_is_normalised_given_no_totp_uri_beside_them() {
        TranscriptNormaliser normaliser = new TranscriptNormaliser(Map.of());
        JsonNode raw = json.readTree("{\"spayd\":\"SPD*1.0\",\"qrCode\":{\"size\":21,\"modules\":\"0101\"},\"code\":\"donations/rule\"}");

        assertThat(normaliser.json(raw)).isEqualTo(raw);
    }

    @Test
    @DisplayName("Given a payment QR whose SPAYD carries a recovery code, when a body is normalised, then its modules are masked and its size stays")
    void should_mask_the_modules_and_keep_the_size_when_a_body_is_normalised_given_a_payment_qr_of_a_recovery_code() {
        TranscriptNormaliser normaliser = new TranscriptNormaliser(Map.of());
        JsonNode raw = json.readTree("{\"message\":\"OBNOVA DHG66PK2\",\"spayd\":\"SPD*1.0*MSG:OBNOVA DHG66PK2\",\"qrCode\":{\"size\":49,\"modules\":\"0101\"}}");

        assertThat(normaliser.json(raw)).isEqualTo(json.readTree("""
                {"message":"OBNOVA <recovery-code>","spayd":"SPD*1.0*MSG:OBNOVA <recovery-code>","qrCode":{"size":49,"modules":"<qr-of-masked-text>"}}"""));
    }

    private static String base64Url(String id) {
        UUID uuid = UUID.fromString(id);
        ByteBuffer bytes = ByteBuffer.allocate(16).putLong(uuid.getMostSignificantBits()).putLong(uuid.getLeastSignificantBits());
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes.array());
    }

    @Test
    @DisplayName("Given a path with ids and a query, when its template is taken, then ids become {id} and the query goes")
    void should_replace_ids_and_drop_the_query_when_the_template_is_taken_given_a_path_with_ids_and_a_query() {
        assertThat(TranscriptNormaliser.template("/api/admin/donors/" + FIRST_ID + "/payments/" + SECOND_ID + "?page=2"))
                .isEqualTo("/api/admin/donors/{id}/payments/{id}");
    }
}

package cz.novanadeje.app.cucumber.transcript;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.util.Map;

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
    @DisplayName("Given a payment QR without a TOTP URI beside it, when a body is normalised, then its modules are kept")
    void should_keep_payment_qr_modules_when_a_body_is_normalised_given_no_totp_uri_beside_them() {
        TranscriptNormaliser normaliser = new TranscriptNormaliser(Map.of());
        JsonNode raw = json.readTree("{\"spayd\":\"SPD*1.0\",\"qrCode\":{\"size\":21,\"modules\":\"0101\"},\"code\":\"donations/rule\"}");

        assertThat(normaliser.json(raw)).isEqualTo(raw);
    }

    @Test
    @DisplayName("Given a path with ids and a query, when its template is taken, then ids become {id} and the query goes")
    void should_replace_ids_and_drop_the_query_when_the_template_is_taken_given_a_path_with_ids_and_a_query() {
        assertThat(TranscriptNormaliser.template("/api/admin/donors/" + FIRST_ID + "/payments/" + SECOND_ID + "?page=2"))
                .isEqualTo("/api/admin/donors/{id}/payments/{id}");
    }
}

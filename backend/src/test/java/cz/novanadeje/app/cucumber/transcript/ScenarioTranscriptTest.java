package cz.novanadeje.app.cucumber.transcript;

import jakarta.mail.Session;
import jakarta.mail.internet.InternetAddress;
import jakarta.mail.internet.MimeMessage;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.mail.javamail.MimeMessageHelper;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.JsonNodeFactory;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.Properties;

import static org.assertj.core.api.Assertions.assertThat;

class ScenarioTranscriptTest {

    private static final String DONOR_ID = "019a2b3c-4d5e-7f60-8a9b-0c1d2e3f4a5b";
    private static final String PAYMENT_ID = "019a2b3c-4d5e-7f60-8a9b-0c1d2e3f4a5c";

    private final JsonMapper json = JsonMapper.builder().build();

    @Nested
    @DisplayName("Given a scenario that calls two endpoints, one of them twice")
    class GivenTwoEndpoints {

        private final ScenarioTranscript transcript = new ScenarioTranscript();

        GivenTwoEndpoints() {
            transcript.exchange(exchange("GET", "/api/admin/donors/" + DONOR_ID, 200, "{\"id\":\"" + DONOR_ID + "\"}"));
            transcript.exchange(exchange("POST", "/api/admin/donations/payments/" + PAYMENT_ID + "/pair", 204, null));
            transcript.exchange(exchange("GET", "/api/admin/donors/" + PAYMENT_ID + "?tab=payments", 404, "{\"type\":\"x\"}"));
        }

        @Test
        @DisplayName("when the transcript is written, then calls are keyed by method, path template and ordinal in call order")
        void should_key_calls_by_method_template_and_ordinal_when_written() {
            JsonNode written = transcript.toJson(Map.of());

            assertThat(written.get("requests").propertyNames())
                    .containsExactly("GET /api/admin/donors/{id} #1", "POST /api/admin/donations/payments/{id}/pair #1", "GET /api/admin/donors/{id} #2");
        }

        @Test
        @DisplayName("when the transcript is written, then ids are numbered across paths and bodies and the query is kept normalised")
        void should_number_ids_across_paths_and_bodies_when_written() {
            JsonNode written = transcript.toJson(Map.of());

            JsonNode first = written.get("requests").get("GET /api/admin/donors/{id} #1");
            JsonNode last = written.get("requests").get("GET /api/admin/donors/{id} #2");
            assertThat(first.get("request").get("path").asString()).isEqualTo("/api/admin/donors/<id:1>");
            assertThat(first.get("response").get("body").get("id").asString()).isEqualTo("<id:1>");
            assertThat(last.get("request").get("path").asString()).isEqualTo("/api/admin/donors/<id:2>?tab=payments");
            assertThat(last.get("response").get("status").asInt()).isEqualTo(404);
        }
    }

    @Test
    @DisplayName("Given response headers, when the transcript is written, then volatile ones go and a cookie keeps only its name and attributes")
    void should_drop_volatile_headers_and_mask_cookie_values_when_written_given_response_headers() {
        ScenarioTranscript transcript = new ScenarioTranscript();
        HttpHeaders headers = new HttpHeaders();
        headers.add("Content-Type", "application/json");
        headers.add("Cache-Control", "no-store");
        headers.add("Date", "Thu, 29 Oct 2026 12:00:00 GMT");
        headers.add("Content-Length", "12");
        headers.add("Set-Cookie", "refresh_token=q3Yb7xP0aZ9mN2kLw8RtUv5sC1dE4fGhJiKoMnBvCxZ; Path=/api/donors/auth; Max-Age=2592000; HttpOnly; Secure; SameSite=Strict");
        transcript.exchange(new RecordedExchange("POST", "/api/donors/auth/login", Map.of("Authorization", "Bearer eyJh.eyJz.c2ln", "X-Forwarded-For", "10.0.0.7"),
                JsonNodeFactory.instance.objectNode().put("password", "Heslo-12345"), 200, headers, "{}".getBytes(StandardCharsets.UTF_8)));

        JsonNode call = transcript.toJson(Map.of()).get("requests").get("POST /api/donors/auth/login #1");

        assertThat(call.get("request").get("headers").toString()).isEqualTo("{\"Authorization\":\"Bearer <jwt>\"}");
        assertThat(call.get("request").get("body").get("password").asString()).isEqualTo("<secret>");
        assertThat(call.get("response").get("headers").toString()).isEqualTo("{\"Cache-Control\":[\"no-store\"],\"Content-Type\":[\"application/json\"],"
                + "\"Set-Cookie\":[\"refresh_token=<secret>; Path=/api/donors/auth; Max-Age=2592000; HttpOnly; Secure; SameSite=Strict\"]}");
    }

    @Test
    @DisplayName("Given mails sent in any order, when the transcript is written, then their parts are normalised and sorted")
    void should_normalise_and_sort_mails_when_written_given_mails_sent_in_any_order() throws Exception {
        ScenarioTranscript transcript = new ScenarioTranscript();
        transcript.mails(List.of(mail("petr@example.cz", "Zapomenuté heslo", "Odkaz https://nfnn.cz/heslo#q3Yb7xP0aZ9mN2kLw8RtUv5sC1dE4fGhJiKoMnBvCxZ"),
                mail("jana@example.cz", "Vítejte", "Váš variabilní symbol je 4815162342.")));

        JsonNode mails = transcript.toJson(Map.of("4815162342", "<vs:Jana>")).get("mails");

        assertThat(mails).hasSize(2);
        assertThat(mails.get(0).get("to").get(0).asString()).isEqualTo("jana@example.cz");
        assertThat(mails.get(0).get("text").asString()).isEqualTo("Váš variabilní symbol je <vs:Jana>.");
        assertThat(mails.get(1).get("subject").asString()).isEqualTo("Zapomenuté heslo");
        assertThat(mails.get(1).get("text").asString()).isEqualTo("Odkaz https://nfnn.cz/heslo#<token>");
        assertThat(mails.get(1).get("htmlSha256").asString()).hasSize(64);
    }

    @Test
    @DisplayName("Given log lines from several threads, when the transcript is written, then they are normalised and sorted")
    void should_normalise_and_sort_log_lines_when_written_given_lines_from_several_threads() {
        ScenarioTranscript transcript = new ScenarioTranscript();
        transcript.logs(List.of(new RecordedLogLine("WARN", "cz.novanadeje.app.donors.X", "Donor " + DONOR_ID + " refused", "IllegalStateException"),
                new RecordedLogLine("INFO", "cz.novanadeje.app.donations.Y", "Imported 2 payments", "")));

        JsonNode logs = transcript.toJson(Map.of()).get("logs");

        assertThat(logs.toString()).isEqualTo("[{\"level\":\"INFO\",\"logger\":\"cz.novanadeje.app.donations.Y\",\"message\":\"Imported 2 payments\"},"
                + "{\"level\":\"WARN\",\"logger\":\"cz.novanadeje.app.donors.X\",\"message\":\"Donor <id:1> refused\",\"exception\":\"IllegalStateException\"}]");
    }

    @Test
    @DisplayName("Given the same calls recorded twice, when both transcripts are written, then they are identical")
    void should_write_identical_transcripts_when_the_same_calls_are_recorded_twice() {
        ScenarioTranscript first = new ScenarioTranscript();
        ScenarioTranscript second = new ScenarioTranscript();
        for (ScenarioTranscript transcript : List.of(first, second)) {
            transcript.exchange(exchange("GET", "/api/admin/donors/" + DONOR_ID, 200, "{\"id\":\"" + DONOR_ID + "\",\"payments\":[\"" + PAYMENT_ID + "\"]}"));
        }

        assertThat(json.writeValueAsString(first.toJson(Map.of()))).isEqualTo(json.writeValueAsString(second.toJson(Map.of())));
    }

    private static RecordedExchange exchange(String method, String uri, int status, String body) {
        HttpHeaders headers = new HttpHeaders();
        if (body != null) {
            headers.add("Content-Type", "application/json");
        }
        return new RecordedExchange(method, uri, Map.of(), null, status, headers, body == null ? new byte[0] : body.getBytes(StandardCharsets.UTF_8));
    }

    private static MimeMessage mail(String to, String subject, String text) throws Exception {
        MimeMessage message = new MimeMessage(Session.getInstance(new Properties()));
        MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");
        helper.setFrom(new InternetAddress("info@nfnn.cz"));
        helper.setTo(to);
        helper.setSubject(subject);
        helper.setText(text, "<p>" + text + "</p>");
        message.saveChanges();
        return message;
    }
}

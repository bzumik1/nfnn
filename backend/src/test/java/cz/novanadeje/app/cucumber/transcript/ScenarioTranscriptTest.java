package cz.novanadeje.app.cucumber.transcript;

import jakarta.mail.Session;
import jakarta.mail.internet.InternetAddress;
import jakarta.mail.internet.MimeMessage;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.mail.javamail.MimeMessageHelper;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.JsonNodeFactory;

import java.io.ByteArrayOutputStream;
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
        headers.add("Set-Cookie", "refresh_token=q3Yb7xP0aZ9mN2kLw8RtUv5sC1dE4fGhJiKoMnBvCxZ; Path=/api/donors/auth; Max-Age=2592000; Expires=Thu, 12 Nov 2026 14:05:22 GMT; HttpOnly; Secure; SameSite=Strict");
        transcript.exchange(new RecordedExchange("POST", "/api/donors/auth/login", Map.of("Authorization", "Bearer eyJh.eyJz.c2ln", "X-Forwarded-For", "10.0.0.7"),
                JsonNodeFactory.instance.objectNode().put("password", "Heslo-12345"), 200, headers, "{}".getBytes(StandardCharsets.UTF_8)));

        JsonNode call = transcript.toJson(Map.of()).get("requests").get("POST /api/donors/auth/login #1");

        assertThat(call.get("request").get("headers").toString()).isEqualTo("{\"Authorization\":\"Bearer <jwt>\"}");
        assertThat(call.get("request").get("body").get("password").asString()).isEqualTo("<secret>");
        assertThat(call.get("response").get("headers").toString()).isEqualTo("{\"Cache-Control\":\"no-store\",\"Content-Type\":\"application/json\","
                + "\"Set-Cookie\":\"refresh_token=<secret>; Path=/api/donors/auth; Max-Age=2592000; Expires=<time>; HttpOnly; Secure; SameSite=Strict\"}");
    }

    @Test
    @DisplayName("Given a request body from a map without order, when the transcript is written, then its fields are sorted at every level")
    void should_sort_request_body_fields_at_every_level_when_written_given_a_map_without_order() {
        ScenarioTranscript transcript = new ScenarioTranscript();
        transcript.exchange(new RecordedExchange("POST", "/api/contact/messages", Map.of(),
                json.readTree("{\"message\":\"Dobrý den\",\"address\":{\"street\":\"Nádražní 1\",\"city\":\"Tišnov\"},\"email\":\"jana@example.cz\"}"),
                202, new HttpHeaders(), new byte[0]));

        JsonNode body = transcript.toJson(Map.of()).get("requests").get("POST /api/contact/messages #1").get("request").get("body");

        assertThat(body.toString()).isEqualTo("{\"address\":{\"city\":\"Tišnov\",\"street\":\"Nádražní 1\"},\"email\":\"jana@example.cz\",\"message\":\"Dobrý den\"}");
    }

    @Test
    @DisplayName("Given the diagnostics and a thread dump, when the transcript is written, then only the shape of their machine-dependent bodies is kept")
    void should_keep_only_the_shape_of_machine_dependent_bodies_when_written_given_diagnostics_and_a_thread_dump() {
        ScenarioTranscript transcript = new ScenarioTranscript();
        transcript.exchange(exchange("GET", "/api/admin/operations/diagnostics", 200,
                "{\"jvm\":{\"javaVersion\":\"25.0.5\",\"heapUsedBytes\":415889472,\"virtual\":false},\"disks\":[{\"path\":\"/data\",\"freeBytes\":1},{\"path\":\"/logs\",\"freeBytes\":2}],\"error\":null}"));
        transcript.exchange(new RecordedExchange("GET", "/api/admin/operations/diagnostics/threads", Map.of(), null, 200, textHeaders(),
                "\"main\" #1 RUNNABLE".getBytes(StandardCharsets.UTF_8)));

        JsonNode requests = transcript.toJson(Map.of()).get("requests");

        assertThat(requests.get("GET /api/admin/operations/diagnostics #1").get("response").get("body").toString())
                .isEqualTo("{\"disks\":[{\"freeBytes\":\"<number>\",\"path\":\"<string>\"}],\"error\":null,"
                        + "\"jvm\":{\"heapUsedBytes\":\"<number>\",\"javaVersion\":\"<string>\",\"virtual\":\"<boolean>\"}}");
        assertThat(requests.get("GET /api/admin/operations/diagnostics/threads #1").get("response").get("body").asString()).isEqualTo("<string>");
    }

    @Test
    @DisplayName("Given the log files and the backups with file times, when the transcript is written, then the file times are masked")
    void should_mask_file_times_when_written_given_log_files_and_backups() {
        ScenarioTranscript transcript = new ScenarioTranscript();
        transcript.exchange(exchange("GET", "/api/admin/operations/logs", 200,
                "{\"files\":[{\"name\":\"backend.log\",\"changedAt\":\"2026-10-29T14:15:53.473507833Z\"}]}"));
        transcript.exchange(exchange("GET", "/api/admin/operations/backups", 200,
                "{\"restoreFiles\":[{\"fileName\":\"zaloha.dump.done\",\"changedAt\":\"2026-10-29T14:15:37.772514924Z\"}],\"lastBackup\":{\"startedAt\":\"2026-10-23T01:00:00Z\"}}"));

        JsonNode requests = transcript.toJson(Map.of()).get("requests");

        assertThat(requests.get("GET /api/admin/operations/logs #1").get("response").get("body").toString())
                .isEqualTo("{\"files\":[{\"changedAt\":\"<file-time>\",\"name\":\"backend.log\"}]}");
        assertThat(requests.get("GET /api/admin/operations/backups #1").get("response").get("body").toString())
                .isEqualTo("{\"lastBackup\":{\"startedAt\":\"2026-10-23T01:00:00Z\"},\"restoreFiles\":[{\"changedAt\":\"<file-time>\",\"fileName\":\"zaloha.dump.done\"}]}");
    }

    @Test
    @DisplayName("Given field errors in any order, when the transcript is written, then they are sorted by field and message")
    void should_sort_field_errors_when_written_given_them_in_any_order() {
        ScenarioTranscript transcript = new ScenarioTranscript();
        transcript.exchange(exchange("POST", "/api/admin/content/news", 400,
                "{\"type\":\"https://nfnn.cz/problems/validation\",\"errors\":[{\"field\":\"title\",\"message\":\"b\"},{\"field\":\"perex\",\"message\":\"a\"}]}"));

        JsonNode errors = transcript.toJson(Map.of()).get("requests").get("POST /api/admin/content/news #1").get("response").get("body").get("errors");

        assertThat(errors.toString()).isEqualTo("[{\"field\":\"perex\",\"message\":\"a\"},{\"field\":\"title\",\"message\":\"b\"}]");
    }

    @Test
    @DisplayName("Given an answer whose fields v2 writes in an order that changes per JVM, when two runs write it, then both transcripts are identical, ids included")
    void should_write_identical_answers_when_two_runs_write_their_fields_in_other_orders() {
        ScenarioTranscript first = new ScenarioTranscript();
        first.exchange(exchange("POST", "/api/donors/me/passkeys/challenge", 200,
                "{\"challenge\":\"" + DONOR_ID + "\",\"challengeExpiresAt\":\"2026-11-04T09:05:00Z\",\"user\":{\"id\":\"" + PAYMENT_ID + "\",\"name\":\"jana@example.cz\"}}"));
        ScenarioTranscript second = new ScenarioTranscript();
        second.exchange(exchange("POST", "/api/donors/me/passkeys/challenge", 200,
                "{\"user\":{\"name\":\"jana@example.cz\",\"id\":\"" + PAYMENT_ID + "\"},\"challengeExpiresAt\":\"2026-11-04T09:05:00Z\",\"challenge\":\"" + DONOR_ID + "\"}"));

        assertThat(json.writeValueAsString(second.toJson(Map.of()))).isEqualTo(json.writeValueAsString(first.toJson(Map.of())));
    }

    @Test
    @DisplayName("Given field errors whose fields v2 writes in any order, when two runs write them, then both transcripts are identical")
    void should_write_identical_errors_when_two_runs_write_their_fields_in_other_orders() {
        ScenarioTranscript first = new ScenarioTranscript();
        first.exchange(exchange("PUT", "/api/admin/operations/settings", 400,
                "{\"errors\":[{\"field\":\"MAIL_PORT\",\"code\":\"invalid-port\"},{\"field\":\"PUBLIC_URL\",\"code\":\"placeholder\"}]}"));
        ScenarioTranscript second = new ScenarioTranscript();
        second.exchange(exchange("PUT", "/api/admin/operations/settings", 400,
                "{\"errors\":[{\"code\":\"placeholder\",\"field\":\"PUBLIC_URL\"},{\"code\":\"invalid-port\",\"field\":\"MAIL_PORT\"}]}"));

        assertThat(json.writeValueAsString(second.toJson(Map.of()))).isEqualTo(json.writeValueAsString(first.toJson(Map.of())));
    }

    @Test
    @DisplayName("Given list items stamped with the same instant, which v2 orders by random ids, when two runs list them in other orders, then both transcripts are identical")
    void should_write_identical_transcripts_when_items_stamped_with_the_same_instant_come_in_other_orders() {
        String older = "{\"id\":\"" + DONOR_ID + "\",\"action\":\"RESET_LOG_LEVEL\",\"performedAt\":\"2026-10-23T10:00:00Z\"}";
        String newer = "{\"id\":\"" + PAYMENT_ID + "\",\"action\":\"CHANGE_LOG_LEVEL\",\"performedAt\":\"2026-10-23T10:00:00Z\"}";
        String first = "{\"id\":\"019a2b3c-4d5e-7f60-8a9b-0c1d2e3f4a5d\",\"action\":\"SIGN_IN\",\"performedAt\":\"2026-10-23T09:00:00Z\"}";
        ScenarioTranscript oneRun = new ScenarioTranscript();
        oneRun.exchange(exchange("GET", "/api/admin/donors/actions", 200, "{\"items\":[" + older + "," + newer + "," + first + "]}"));
        ScenarioTranscript otherRun = new ScenarioTranscript();
        otherRun.exchange(exchange("GET", "/api/admin/donors/actions", 200, "{\"items\":[" + newer + "," + older + "," + first + "]}"));

        JsonNode items = oneRun.toJson(Map.of()).get("requests").get("GET /api/admin/donors/actions #1").get("response").get("body").get("items");

        assertThat(json.writeValueAsString(oneRun.toJson(Map.of()))).isEqualTo(json.writeValueAsString(otherRun.toJson(Map.of())));
        assertThat(items.get(2).get("action").asString()).isEqualTo("SIGN_IN");
    }

    @Test
    @DisplayName("Given a PDF answer, when the transcript is written, then its page count and text are kept and its bytes, which differ per run, are not")
    void should_keep_page_count_and_text_but_not_the_bytes_when_written_given_a_pdf_answer() throws Exception {
        HttpHeaders headers = new HttpHeaders();
        headers.add("Content-Type", "application/pdf");
        ScenarioTranscript transcript = new ScenarioTranscript();
        transcript.exchange(new RecordedExchange("GET", "/api/donations/me/receipts/yearly?year=2025", Map.of(), null, 200, headers, onePagePdf()));

        JsonNode body = transcript.toJson(Map.of()).get("requests").get("GET /api/donations/me/receipts/yearly #1").get("response").get("body");

        assertThat(body.get("pages").asInt()).isEqualTo(1);
        assertThat(body.get("text").get(0).asString()).isEmpty();
        assertThat(body.has("sha256")).isFalse();
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

        assertThat(logs.toString()).isEqualTo("[\"INFO donations.Y: Imported 2 payments\",\"WARN donors.X: Donor <id:1> refused [IllegalStateException]\"]");
    }

    @Test
    @DisplayName("Given log lines with new ids that threads wrote in either order, when both transcripts are written, then they are identical")
    void should_write_identical_logs_when_threads_wrote_them_in_either_order_given_lines_with_new_ids() {
        RecordedLogLine refused = new RecordedLogLine("WARN", "cz.novanadeje.app.donors.X", "Donor " + DONOR_ID + " refused", "");
        RecordedLogLine paired = new RecordedLogLine("INFO", "cz.novanadeje.app.donations.Y", "Payment " + PAYMENT_ID + " paired", "");
        ScenarioTranscript first = new ScenarioTranscript();
        first.logs(List.of(refused, paired));
        ScenarioTranscript second = new ScenarioTranscript();
        second.logs(List.of(paired, refused));

        assertThat(second.toJson(Map.of()).get("logs")).isEqualTo(first.toJson(Map.of()).get("logs"));
    }

    @Test
    @DisplayName("Given a header sent with several values, when the transcript is written, then it keeps them all in order")
    void should_keep_every_value_in_order_when_written_given_a_header_with_several_values() {
        ScenarioTranscript transcript = new ScenarioTranscript();
        HttpHeaders headers = new HttpHeaders();
        headers.add("Vary", "Origin");
        headers.add("Vary", "Access-Control-Request-Method");
        transcript.exchange(new RecordedExchange("GET", "/api/content/home", Map.of(), null, 200, headers, new byte[0]));

        JsonNode call = transcript.toJson(Map.of()).get("requests").get("GET /api/content/home #1");

        assertThat(call.get("response").get("headers").toString()).isEqualTo("{\"Vary\":[\"Origin\",\"Access-Control-Request-Method\"]}");
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

    private static byte[] onePagePdf() throws Exception {
        try (PDDocument document = new PDDocument(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            document.addPage(new PDPage());
            document.save(out);
            return out.toByteArray();
        }
    }

    private static HttpHeaders textHeaders() {
        HttpHeaders headers = new HttpHeaders();
        headers.add("Content-Type", "text/plain;charset=UTF-8");
        return headers;
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

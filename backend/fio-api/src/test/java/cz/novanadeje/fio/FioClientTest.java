package cz.novanadeje.fio;

import cz.novanadeje.fio.StubFioServer.RecordedRequest;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.io.IOException;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.net.URI;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;

import static cz.novanadeje.fio.Fixtures.PERIODS_STATEMENT;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.catchThrowableOfType;
import static org.assertj.core.api.Assertions.tuple;

class FioClientTest {

    private static final String SECRET = "aGEMtmwcsWAjPzhg3bPH3j7Iu15g56d66AdEbfIjqIgMR9Idh6u3";
    private static final FioToken TOKEN = FioToken.of(SECRET);
    private static final Instant NOW = Instant.parse("2026-10-17T08:00:00Z");
    private static final String JSON = "application/json";

    private StubFioServer server;
    private FioClient client;

    @BeforeEach
    void startServer() {
        server = StubFioServer.start();
        client = FioClient.builder(TOKEN)
                .baseUri(server.baseUri())
                .clock(Clock.fixed(NOW, ZoneOffset.UTC))
                .build();
    }

    @AfterEach
    void stopServer() {
        server.close();
    }

    @Test
    void should_download_since_last_download_as_json_when_new_transactions_requested() {
        server.respondWith(200, Fixtures.read(PERIODS_STATEMENT));

        FioStatement statement = client.newTransactions();

        assertThat(server.requests()).containsExactly(
                new RecordedRequest("GET", "/v1/rest/last/" + SECRET + "/transactions.json", JSON));
        assertThat(statement.info().accountId()).isEqualTo("2400222222");
        assertThat(statement.transactions()).extracting(FioTransaction::id)
                .containsExactly(1148734530L, 1148734781L, 1149190193L);
    }

    @Test
    void should_put_iso_dates_into_path_when_transactions_between_requested() {
        server.respondWith(200, Fixtures.read(PERIODS_STATEMENT));

        FioStatement statement = client.transactionsBetween(LocalDate.of(2026, 1, 5), LocalDate.of(2026, 2, 9));

        assertThat(server.requests()).containsExactly(
                new RecordedRequest("GET", "/v1/rest/periods/" + SECRET + "/2026-01-05/2026-02-09/transactions.json", JSON));
        assertThat(statement.transactions()).hasSize(3);
    }

    @Test
    void should_download_single_day_when_transactions_between_requested_given_same_start_and_end() {
        server.respondWith(200, Fixtures.read(PERIODS_STATEMENT));

        client.transactionsBetween(LocalDate.of(2012, 7, 27), LocalDate.of(2012, 7, 27));

        assertThat(server.requests()).extracting(RecordedRequest::path)
                .containsExactly("/v1/rest/periods/" + SECRET + "/2012-07-27/2012-07-27/transactions.json");
    }

    @Test
    void should_reject_without_request_when_transactions_between_requested_given_end_before_start() {
        assertThatIllegalArgumentException()
                .isThrownBy(() -> client.transactionsBetween(LocalDate.of(2012, 7, 28), LocalDate.of(2012, 7, 27)));
        assertThat(server.requests()).isEmpty();
    }

    @Test
    void should_set_last_downloaded_id_when_requested_given_empty_ok_answer() {
        server.respondWith(200, "");

        client.setLastDownloadedId(1147608196L);

        assertThat(server.requests()).extracting(RecordedRequest::method, RecordedRequest::path)
                .containsExactly(tuple("GET", "/v1/rest/set-last-id/" + SECRET + "/1147608196/"));
    }

    @Test
    void should_set_last_downloaded_date_when_requested_given_empty_ok_answer() {
        server.respondWith(200, "");

        client.setLastDownloadedDate(LocalDate.of(2023, 7, 27));

        assertThat(server.requests()).extracting(RecordedRequest::method, RecordedRequest::path)
                .containsExactly(tuple("GET", "/v1/rest/set-last-date/" + SECRET + "/2023-07-27/"));
    }

    @Test
    void should_reject_without_request_when_last_downloaded_id_set_given_negative_id() {
        assertThatIllegalArgumentException().isThrownBy(() -> client.setLastDownloadedId(-1));
        assertThat(server.requests()).isEmpty();
    }

    @Test
    void should_join_paths_once_when_built_given_base_uri_with_trailing_slash() {
        FioClient trailingSlashClient = FioClient.builder(TOKEN).baseUri(URI.create(server.baseUri() + "/")).build();
        server.respondWith(200, "");

        trailingSlashClient.setLastDownloadedId(1);

        assertThat(server.requests()).extracting(RecordedRequest::path)
                .containsExactly("/v1/rest/set-last-id/" + SECRET + "/1/");
    }

    @Test
    void should_reject_when_building_given_relative_base_uri_or_timeout_that_is_not_positive() {
        FioClient.Builder builder = FioClient.builder(TOKEN);

        assertThatIllegalArgumentException().isThrownBy(() -> builder.baseUri(URI.create("/v1/rest")));
        assertThatIllegalArgumentException().isThrownBy(() -> builder.requestTimeout(Duration.ZERO));
        assertThatIllegalArgumentException().isThrownBy(() -> builder.requestTimeout(Duration.ofSeconds(-1)));
    }

    @Test
    void should_point_at_fio_and_allow_one_request_per_thirty_seconds_given_documented_defaults() {
        assertThat(FioClient.DEFAULT_BASE_URI).isEqualTo(URI.create("https://fioapi.fio.cz/v1/rest"));
        assertThat(FioClient.MINIMUM_REQUEST_INTERVAL).isEqualTo(Duration.ofSeconds(30));
    }

    @Test
    void should_raise_rate_limit_with_retry_time_when_downloading_given_conflict() {
        server.respondWith(409, "");

        FioRateLimitException failure = catchThrowableOfType(FioRateLimitException.class, () -> client.newTransactions());

        assertThat(failure.statusCode()).hasValue(409);
        assertThat(failure.retryAfter()).isEqualTo(NOW.plusSeconds(30));
        assertThat(failure).hasMessageContaining("30 seconds").hasMessageNotContaining(SECRET);
    }

    @Test
    void should_raise_rate_limit_when_setting_last_downloaded_id_given_conflict() {
        server.respondWith(409, "");

        assertThatThrownBy(() -> client.setLastDownloadedId(1147608196L)).isInstanceOf(FioRateLimitException.class);
    }

    @ParameterizedTest
    @ValueSource(ints = {500, 401, 403})
    void should_raise_authorization_failure_when_downloading_given_status_the_api_uses_for_a_bad_token(int status) {
        server.respondWith(status, "<html>Internal Server Error</html>");

        FioAuthorizationException failure = catchThrowableOfType(FioAuthorizationException.class, () -> client.newTransactions());

        assertThat(failure.statusCode()).hasValue(status);
        assertThat(failure.responseBody()).hasValue("<html>Internal Server Error</html>");
        assertThat(failure).hasMessageContaining("token").hasMessageNotContaining(SECRET);
    }

    @Test
    void should_raise_history_locked_when_downloading_given_unprocessable_entity() {
        server.respondWith(422, "");

        FioHistoryLockedException failure = catchThrowableOfType(FioHistoryLockedException.class,
                () -> client.transactionsBetween(LocalDate.of(2025, 1, 1), LocalDate.of(2025, 12, 31)));

        assertThat(failure.statusCode()).hasValue(422);
        assertThat(failure).hasMessageContaining("90 days").hasMessageNotContaining(SECRET);
    }

    @ParameterizedTest
    @ValueSource(ints = {400, 404, 413, 503})
    void should_raise_generic_failure_with_status_and_body_when_downloading_given_other_error_status(int status) {
        server.respondWith(status, "Chyba");

        FioException failure = catchThrowableOfType(FioException.class, () -> client.newTransactions());

        assertThat(failure.getClass()).isEqualTo(FioException.class);
        assertThat(failure.statusCode()).hasValue(status);
        assertThat(failure.responseBody()).hasValue("Chyba");
        assertThat(failure).hasMessageContaining("HTTP " + status).hasMessageNotContaining(SECRET);
    }

    @ParameterizedTest
    @ValueSource(ints = {404, 409, 422, 500})
    void should_mask_token_in_message_and_body_when_failing_given_error_page_that_echoes_the_url(int status) {
        server.respondWith(status, "Not found: /v1/rest/last/" + SECRET + "/transactions.json");

        FioException failure = catchThrowableOfType(FioException.class, () -> client.newTransactions());

        assertThat(failure).hasMessageContaining("/last/***/transactions.json");
        assertThat(failure.responseBody()).hasValue("Not found: /v1/rest/last/***/transactions.json");
        assertThat(printed(failure)).doesNotContain(SECRET);
    }

    @Test
    void should_raise_generic_failure_with_reason_when_downloading_given_ok_answer_that_is_not_a_statement() {
        server.respondWith(200, "<html>Údržba</html>");

        FioException failure = catchThrowableOfType(FioException.class, () -> client.newTransactions());

        assertThat(failure.getClass()).isEqualTo(FioException.class);
        assertThat(failure.statusCode()).hasValue(200);
        assertThat(failure).hasMessageContaining("not valid JSON").hasMessageNotContaining(SECRET);
    }

    @Test
    void should_raise_transport_failure_without_token_when_downloading_given_server_that_is_not_listening() {
        URI unreachable = server.baseUri();
        server.close();
        FioClient offlineClient = FioClient.builder(TOKEN).baseUri(unreachable).build();

        FioTransportException failure = catchThrowableOfType(FioTransportException.class, offlineClient::newTransactions);

        assertThat(failure.statusCode()).isEmpty();
        assertThat(failure.responseBody()).isEmpty();
        assertThat(failure).hasMessageContaining("/last/***/transactions.json");
        assertThat(printed(failure)).doesNotContain(SECRET);
    }

    @Test
    void should_raise_transport_failure_when_downloading_given_answer_slower_than_request_timeout() {
        server.respondAfter(Duration.ofSeconds(2), 200, Fixtures.read(PERIODS_STATEMENT));
        FioClient impatientClient = FioClient.builder(TOKEN)
                .baseUri(server.baseUri())
                .requestTimeout(Duration.ofMillis(200))
                .build();

        assertThatThrownBy(impatientClient::newTransactions).isInstanceOf(FioTransportException.class);
    }

    @Test
    void should_send_through_given_http_client_and_hide_token_in_cause_when_it_fails_with_message_naming_the_url() {
        IOException failureNamingUrl = new IOException("Cannot reach https://fioapi.fio.cz/v1/rest/last/" + SECRET + "/transactions.json",
                new IOException("Nested " + SECRET));
        FioClient failingClient = FioClient.builder(TOKEN).httpClient(new FailingHttpClient(failureNamingUrl)).build();

        FioTransportException failure = catchThrowableOfType(FioTransportException.class, failingClient::newTransactions);

        assertThat(failure).hasMessageContaining("Cannot reach https://fioapi.fio.cz/v1/rest/last/***/transactions.json");
        assertThat(failure.getCause()).isNotNull();
        assertThat(printed(failure)).doesNotContain(SECRET).contains("java.io.IOException");
    }

    @Test
    void should_keep_original_cause_when_failing_given_cause_without_token() {
        IOException plainFailure = new IOException("Connection reset");
        FioClient failingClient = FioClient.builder(TOKEN).httpClient(new FailingHttpClient(plainFailure)).build();

        FioTransportException failure = catchThrowableOfType(FioTransportException.class, () -> failingClient.setLastDownloadedId(1L));

        assertThat(failure.getCause()).isSameAs(plainFailure);
    }

    @Test
    void should_not_reveal_token_when_printed_given_client() {
        assertThat(client.toString()).doesNotContain(SECRET);
    }

    @Test
    void should_let_callers_switch_exhaustively_given_sealed_failures() {
        List<Class<?>> permitted = List.of(FioException.class.getPermittedSubclasses());

        assertThat(FioException.class.isSealed()).isTrue();
        assertThat(RuntimeException.class).isAssignableFrom(FioException.class);
        assertThat(permitted).containsExactlyInAnyOrder(
                FioRateLimitException.class,
                FioAuthorizationException.class,
                FioHistoryLockedException.class,
                FioTransportException.class);
    }

    private static String printed(Throwable failure) {
        StringWriter text = new StringWriter();
        failure.printStackTrace(new PrintWriter(text));
        return text.toString();
    }
}

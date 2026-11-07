package cz.novanadeje.app.donations.infrastructure.cnb;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import cz.novanadeje.app.donations.application.bankcode.BankCodeFetch;
import cz.novanadeje.app.donations.application.bankcode.BankCodeSourceUnavailable;
import cz.novanadeje.app.donations.domain.bankcode.BankCodeListState;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class CnbBankCodeSourceTest {

    private static final String PATH = "/kody_bank_CR.csv";
    private static final String LAST_MODIFIED = "Fri, 25 Sep 2026 11:10:55 GMT";
    private static final Duration FUNCTIONAL_TIMEOUT = Duration.ofSeconds(30);

    private final AtomicReference<Answer> answer = new AtomicReference<>();
    private final List<Optional<String>> askedIfModifiedSince = new CopyOnWriteArrayList<>();
    private HttpServer server;
    private CnbBankCodeSource source;

    @BeforeEach
    void startServer() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext(PATH, exchange -> {
            askedIfModifiedSince.add(Optional.ofNullable(exchange.getRequestHeaders().getFirst("If-Modified-Since")));
            answer.get().send(exchange);
        });
        server.setExecutor(Executors.newVirtualThreadPerTaskExecutor());
        server.start();
        source = localSource(FUNCTIONAL_TIMEOUT);
        answer.set(Answer.of(200, CnbBankCodeCsvTest.published(), LAST_MODIFIED));
    }

    @AfterEach
    void stopServer() {
        server.stop(0);
    }

    @Test
    @DisplayName("Given the published list, when it is fetched for the first time, then every code comes with the source's last modification and nothing is sent as known")
    void should_return_list_and_last_modified_when_fetched_given_published_list() {
        BankCodeFetch fetch = source.fetch(BankCodeListState.none());

        assertThat(fetch).isInstanceOfSatisfying(BankCodeFetch.Fetched.class, fetched -> {
            assertThat(fetched.list().banks()).hasSize(47);
            assertThat(fetched.lastModified()).contains(LAST_MODIFIED);
        });
        assertThat(askedIfModifiedSince).containsExactly(Optional.empty());
    }

    @Test
    @DisplayName("Given a list fetched before, when the source answers not modified, then it is unchanged and the stored last modification was sent")
    void should_be_unchanged_when_fetched_given_not_modified() {
        answer.set(Answer.of(304, new byte[0], null));

        assertThat(source.fetch(BankCodeListState.none().fetched(Instant.parse("2026-10-01T05:40:00Z"), LAST_MODIFIED))).isInstanceOf(BankCodeFetch.Unchanged.class);
        assertThat(askedIfModifiedSince).containsExactly(Optional.of(LAST_MODIFIED));
    }

    @Test
    @DisplayName("Given the source answers with an error, a rate refusal or a redirect, when the list is fetched, then it is unavailable with the status")
    void should_be_unavailable_with_status_when_fetched_given_other_status() {
        for (int status : new int[]{500, 503, 429, 404, 301, 302}) {
            answer.set(Answer.of(status, new byte[0], null));
            assertThatThrownBy(() -> source.fetch(BankCodeListState.none())).isInstanceOf(BankCodeSourceUnavailable.class).hasMessage("status " + status);
        }
    }

    @Test
    @DisplayName("Given a page instead of the list, when the list is fetched, then it is unavailable as a refused list")
    void should_be_unavailable_as_refused_list_when_fetched_given_wrong_content() {
        answer.set(Answer.of(200, "<html>Údržba</html>".getBytes(StandardCharsets.UTF_8), LAST_MODIFIED));

        assertThatThrownBy(() -> source.fetch(BankCodeListState.none())).isInstanceOf(BankCodeSourceUnavailable.class).hasMessage("refused list");
    }

    @Test
    @DisplayName("Given an answer larger than 64 KiB, when the list is fetched, then it is unavailable as too large")
    void should_be_unavailable_as_too_large_when_fetched_given_oversized_answer() {
        byte[] large = (CnbBankCodeCsvTest.HEADER + "\r\n" + CnbBankCodeCsvTest.rows(400, "\r\n") + "x".repeat(66_000)).getBytes(StandardCharsets.UTF_8);
        answer.set(Answer.of(200, large, null));

        assertThatThrownBy(() -> source.fetch(BankCodeListState.none())).isInstanceOf(BankCodeSourceUnavailable.class).hasMessage("too large");
    }

    @Test
    @DisplayName("Given a source that stalls the body, when the list is fetched, then it is unavailable as a timeout within the timeout")
    void should_time_out_when_fetched_given_stalled_body() throws IOException {
        answer.set(new Answer(200, CnbBankCodeCsvTest.published(), null, Duration.ofSeconds(6)));
        CnbBankCodeSource impatient = localSource(Duration.ofSeconds(2));
        long started = System.nanoTime();

        assertThatThrownBy(() -> impatient.fetch(BankCodeListState.none())).isInstanceOf(BankCodeSourceUnavailable.class).hasMessage("timeout");
        assertThat(Duration.ofNanos(System.nanoTime() - started)).isLessThan(Duration.ofMillis(5_500));
    }

    @Test
    @DisplayName("Given the source cannot be reached, when the list is fetched, then it is unavailable as unreachable")
    void should_be_unavailable_as_unreachable_when_fetched_given_stopped_server() {
        server.stop(0);

        assertThatThrownBy(() -> source.fetch(BankCodeListState.none())).isInstanceOf(BankCodeSourceUnavailable.class).hasMessage("unreachable");
    }

    @Test
    @DisplayName("Given the production settings, when the source resolves to a private address or is not https, then it is not asked")
    void should_refuse_when_fetched_given_private_address_or_plain_http() {
        CnbBankCodeSource strict = new CnbBankCodeSource(HttpClient.newHttpClient(), URI.create("https://127.0.0.1:" + port() + PATH), false,
                Duration.ofMillis(500));
        CnbBankCodeSource plain = new CnbBankCodeSource(HttpClient.newHttpClient(), URI.create("http://www.cnb.cz" + PATH), false,
                Duration.ofMillis(500));

        assertThatThrownBy(() -> strict.fetch(BankCodeListState.none())).isInstanceOf(BankCodeSourceUnavailable.class).hasMessage("non-public address");
        assertThatThrownBy(() -> plain.fetch(BankCodeListState.none())).isInstanceOf(BankCodeSourceUnavailable.class).hasMessage("not https");
        assertThat(askedIfModifiedSince).isEmpty();
    }

    private CnbBankCodeSource localSource(Duration timeout) {
        return new CnbBankCodeSource(HttpClient.newBuilder().followRedirects(HttpClient.Redirect.NEVER).build(),
                URI.create("http://127.0.0.1:" + port() + PATH), true, timeout);
    }

    private int port() {
        return server.getAddress().getPort();
    }

    private record Answer(int status, byte[] body, String lastModified, Duration stall) {

        static Answer of(int status, byte[] body, String lastModified) {
            return new Answer(status, body, lastModified, Duration.ZERO);
        }

        void send(HttpExchange exchange) throws IOException {
            exchange.getResponseHeaders().add("Content-Type", "text/html;charset=UTF-8");
            if (lastModified != null) {
                exchange.getResponseHeaders().add("Last-Modified", lastModified);
            }
            if (status / 100 == 3 && status != 304) {
                exchange.getResponseHeaders().add("Location", "/elsewhere");
            }
            exchange.sendResponseHeaders(status, body.length == 0 ? -1 : body.length);
            try (OutputStream out = exchange.getResponseBody()) {
                if (stall.isZero()) {
                    out.write(body);
                } else {
                    out.write(body, 0, 1);
                    out.flush();
                    Thread.sleep(stall.toMillis());
                }
            } catch (IOException | InterruptedException closed) {
                exchange.close();
            }
        }
    }
}

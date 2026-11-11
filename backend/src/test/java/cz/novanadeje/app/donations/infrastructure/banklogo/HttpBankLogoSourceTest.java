package cz.novanadeje.app.donations.infrastructure.banklogo;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import cz.novanadeje.app.donations.application.banklogo.BankLogoUnavailable;
import cz.novanadeje.app.donations.application.banklogo.FetchedBankLogo;
import cz.novanadeje.app.donations.domain.bankcode.BankCode;
import cz.novanadeje.app.donations.domain.banklogo.BankLogoFailure;
import cz.novanadeje.app.donations.domain.banklogo.BankLogoSource;
import cz.novanadeje.app.donations.domain.banklogo.BankLogoSourceInvalid;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.awt.image.BufferedImage;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.UnknownHostException;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class HttpBankLogoSourceTest {

    private static final String PATH = "/image/thumb/AppIcon/512x512bb.jpg";
    private static final BankLogoSource SOURCE = new BankLogoSource(new BankCode("0800"), "https://is1-ssl.mzstatic.com" + PATH);
    private static final Duration FUNCTIONAL_TIMEOUT = Duration.ofSeconds(30);

    private final AtomicReference<Answer> answer = new AtomicReference<>();
    private final List<Map<String, List<String>>> requests = new CopyOnWriteArrayList<>();
    private HttpServer server;

    @BeforeEach
    void startServer() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", exchange -> {
            requests.add(Map.copyOf(exchange.getRequestHeaders()));
            answer.get().send(exchange);
        });
        server.setExecutor(Executors.newVirtualThreadPerTaskExecutor());
        server.start();
        answer.set(Answer.of(200, "image/jpeg", jpeg()));
    }

    @AfterEach
    void stopServer() {
        server.stop(0);
    }

    @Test
    @DisplayName("Given the source serves a JPEG, when the logo is fetched, then it comes back as a WebP with its digest, asked for PNG or JPEG under the site's own name")
    void should_return_webp_when_fetched_given_jpeg() {
        FetchedBankLogo fetched = local(FUNCTIONAL_TIMEOUT).fetch(SOURCE);

        assertThat(new String(fetched.webp(), 8, 4, StandardCharsets.US_ASCII)).isEqualTo("WEBP");
        assertThat(fetched.sha256()).hasSize(64);
        assertThat(requests).singleElement().satisfies(headers -> {
            assertThat(headers.get("Accept")).containsExactly("image/png, image/jpeg");
            assertThat(headers.get("User-agent")).containsExactly(HttpBankLogoSource.USER_AGENT);
        });
    }

    @Test
    @DisplayName("Given the source answers with a redirect, when the logo is fetched, then it is refused as redirected and the target is never asked")
    void should_refuse_as_redirected_when_fetched_given_redirect() {
        for (int status : new int[]{301, 302, 303, 307, 308}) {
            answer.set(new Answer(status, "image/jpeg", new byte[0], Duration.ZERO, Map.of("Location", "http://127.0.0.1:1/elsewhere")));
            assertThatThrownBy(() -> local(FUNCTIONAL_TIMEOUT).fetch(SOURCE)).isInstanceOfSatisfying(BankLogoUnavailable.class,
                    refused -> assertThat(refused.failure()).isEqualTo(BankLogoFailure.REDIRECTED));
        }
        assertThat(requests).hasSize(5);
    }

    @Test
    @DisplayName("Given the source answers with an error, when the logo is fetched, then it is refused with the status failure")
    void should_refuse_with_status_when_fetched_given_error() {
        for (int status : new int[]{404, 429, 500, 503}) {
            answer.set(Answer.of(status, "text/html", "<html/>".getBytes(StandardCharsets.UTF_8)));
            assertThatThrownBy(() -> local(FUNCTIONAL_TIMEOUT).fetch(SOURCE)).isInstanceOfSatisfying(BankLogoUnavailable.class,
                    refused -> assertThat(refused.failure()).isEqualTo(BankLogoFailure.STATUS));
        }
    }

    @Test
    @DisplayName("Given the source serves a page, an SVG or a PNG named as a JPEG, when the logo is fetched, then it is refused as an unsupported type")
    void should_refuse_as_unsupported_when_fetched_given_wrong_type_or_bytes() throws IOException {
        for (Answer wrong : List.of(Answer.of(200, "text/html", "<html/>".getBytes(StandardCharsets.UTF_8)),
                Answer.of(200, "image/svg+xml", "<svg/>".getBytes(StandardCharsets.UTF_8)),
                Answer.of(200, "image/jpeg", BankLogoPicturesTest.encode(new BufferedImage(8, 8, BufferedImage.TYPE_INT_RGB), "png")))) {
            answer.set(wrong);
            assertThatThrownBy(() -> local(FUNCTIONAL_TIMEOUT).fetch(SOURCE)).isInstanceOfSatisfying(BankLogoUnavailable.class,
                    refused -> assertThat(refused.failure()).isEqualTo(BankLogoFailure.UNSUPPORTED_TYPE));
        }
    }

    @Test
    @DisplayName("Given an answer over 1 MiB, when the logo is fetched, then it is refused as too large")
    void should_refuse_as_too_large_when_fetched_given_oversized_body() {
        answer.set(Answer.of(200, "image/jpeg", new byte[HttpBankLogoSource.MAX_BYTES + 1]));

        assertThatThrownBy(() -> local(FUNCTIONAL_TIMEOUT).fetch(SOURCE)).isInstanceOfSatisfying(BankLogoUnavailable.class,
                refused -> assertThat(refused.failure()).isEqualTo(BankLogoFailure.TOO_LARGE));
    }

    @Test
    @DisplayName("Given a source that stalls the body, when the logo is fetched, then it is refused as a timeout within the deadline")
    void should_time_out_when_fetched_given_stalled_body() {
        answer.set(new Answer(200, "image/jpeg", jpeg(), Duration.ofSeconds(6), Map.of()));
        long started = System.nanoTime();

        assertThatThrownBy(() -> local(Duration.ofSeconds(2)).fetch(SOURCE)).isInstanceOfSatisfying(BankLogoUnavailable.class,
                refused -> assertThat(refused.failure()).isEqualTo(BankLogoFailure.TIMEOUT));
        assertThat(Duration.ofNanos(System.nanoTime() - started)).isLessThan(Duration.ofMillis(5_500));
    }

    @Test
    @DisplayName("Given a stored source the allow-list no longer admits, when the logo is fetched, then it is refused as an invalid source and nothing is asked")
    void should_refuse_without_asking_when_fetched_given_source_no_longer_allowed() {
        BankLogoSource offList = BankLogoSource.stored(new BankCode("0800"), "https://www.example.com" + PATH);

        assertThatThrownBy(() -> local(FUNCTIONAL_TIMEOUT).fetch(offList)).isInstanceOf(BankLogoSourceInvalid.class);
        assertThat(requests).isEmpty();
    }

    @Test
    @DisplayName("Given the source cannot be reached, when the logo is fetched, then it is refused as unreachable")
    void should_refuse_as_unreachable_when_fetched_given_stopped_server() {
        server.stop(0);

        assertThatThrownBy(() -> local(FUNCTIONAL_TIMEOUT).fetch(SOURCE)).isInstanceOfSatisfying(BankLogoUnavailable.class,
                refused -> assertThat(refused.failure()).isEqualTo(BankLogoFailure.UNREACHABLE));
    }

    @Test
    @DisplayName("Given the production checks, when the host resolves to a private address, is unknown or resolves too slowly, then the source is never asked")
    void should_refuse_before_asking_when_fetched_given_private_unknown_or_slow_host() {
        HttpBankLogoSource privateHost = strict(host -> new InetAddress[]{InetAddress.getByName("10.0.0.7")});
        HttpBankLogoSource mixed = strict(host -> new InetAddress[]{InetAddress.getByName("17.253.144.10"), InetAddress.getByName("127.0.0.1")});
        HttpBankLogoSource unknown = strict(host -> {
            throw new UnknownHostException(host);
        });
        CountDownLatch never = new CountDownLatch(1);
        HttpBankLogoSource slow = strict(host -> {
            try {
                never.await(10, TimeUnit.SECONDS);
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
            }
            return new InetAddress[]{InetAddress.getByName("17.253.144.10")};
        });

        assertFailure(privateHost, BankLogoFailure.NON_PUBLIC_ADDRESS);
        assertFailure(mixed, BankLogoFailure.NON_PUBLIC_ADDRESS);
        assertFailure(unknown, BankLogoFailure.UNKNOWN_HOST);
        long started = System.nanoTime();
        assertFailure(slow, BankLogoFailure.TIMEOUT);
        assertThat(Duration.ofNanos(System.nanoTime() - started)).isLessThan(Duration.ofSeconds(3));
        assertThat(requests).isEmpty();
    }

    private static void assertFailure(HttpBankLogoSource source, BankLogoFailure failure) {
        assertThatThrownBy(() -> source.fetch(SOURCE)).isInstanceOfSatisfying(BankLogoUnavailable.class,
                refused -> assertThat(refused.failure()).isEqualTo(failure));
    }

    private HttpBankLogoSource local(Duration timeout) {
        URI base = URI.create("http://127.0.0.1:" + server.getAddress().getPort());
        return new HttpBankLogoSource(HttpBankLogoSource.client(), source -> base.resolve(source.uri().getRawPath()), true, timeout, InetAddress::getAllByName);
    }

    private HttpBankLogoSource strict(HostResolver resolver) {
        URI base = URI.create("http://127.0.0.1:" + server.getAddress().getPort());
        return new HttpBankLogoSource(HttpClient.newHttpClient(), source -> base.resolve(source.uri().getRawPath()), false, Duration.ofMillis(800), resolver);
    }

    private static byte[] jpeg() {
        try {
            return BankLogoPicturesTest.encode(new BufferedImage(512, 512, BufferedImage.TYPE_INT_RGB), "jpeg");
        } catch (IOException impossible) {
            throw new IllegalStateException(impossible);
        }
    }

    private record Answer(int status, String contentType, byte[] body, Duration stall, Map<String, String> headers) {

        static Answer of(int status, String contentType, byte[] body) {
            return new Answer(status, contentType, body, Duration.ZERO, Map.of());
        }

        void send(HttpExchange exchange) throws IOException {
            exchange.getResponseHeaders().add("Content-Type", contentType);
            headers.forEach((name, value) -> exchange.getResponseHeaders().add(name, value));
            exchange.sendResponseHeaders(status, body.length == 0 ? -1 : body.length);
            try (OutputStream out = exchange.getResponseBody()) {
                if (!stall.isZero()) {
                    out.write(body, 0, 1);
                    out.flush();
                    try {
                        Thread.sleep(stall);
                    } catch (InterruptedException interrupted) {
                        Thread.currentThread().interrupt();
                    }
                    out.write(body, 1, body.length - 1);
                } else if (body.length > 0) {
                    out.write(body);
                }
            } catch (IOException closedByClient) {
                exchange.close();
            }
        }
    }
}

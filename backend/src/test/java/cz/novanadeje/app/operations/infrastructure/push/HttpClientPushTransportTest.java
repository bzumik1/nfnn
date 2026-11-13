package cz.novanadeje.app.operations.infrastructure.push;

import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.UnknownHostException;
import java.net.http.HttpClient;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.time.Duration;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;

import static org.assertj.core.api.Assertions.assertThat;

class HttpClientPushTransportTest {

    private static final InetAddress PUBLIC = address(8, 8, 8, 8);
    private final List<String> requests = new CopyOnWriteArrayList<>();
    private HttpServer server;

    @BeforeEach
    void startServer() throws IOException {
        server = HttpServer.create(new InetSocketAddress(InetAddress.getLoopbackAddress(), 0), 0);
        server.createContext("/created", exchange -> {
            requests.add(exchange.getRequestMethod() + " " + exchange.getRequestHeaders().getFirst("TTL") + " " + exchange.getRequestBody().readAllBytes().length);
            exchange.sendResponseHeaders(201, 0);
            try (OutputStream body = exchange.getResponseBody()) {
                body.write(new byte[64 * 1024]);
            }
        });
        server.createContext("/moved", exchange -> {
            requests.add("moved");
            exchange.getResponseHeaders().add("Location", "/created");
            exchange.sendResponseHeaders(302, -1);
            exchange.close();
        });
        server.start();
    }

    @AfterEach
    void stopServer() {
        server.stop(0);
    }

    @Test
    @DisplayName("Given a push service that accepts, when a message is posted, then the body and headers reach it and its status comes back without its answer being read")
    void should_post_and_return_status_when_posted_given_an_accepting_service() {
        HttpClientPushTransport transport = transport(host -> new InetAddress[]{PUBLIC});

        int status = transport.post(local("/created"), Map.of("TTL", "86400"), new byte[]{1, 2, 3});

        assertThat(status).isEqualTo(201);
        assertThat(requests).containsExactly("POST 86400 3");
    }

    @Test
    @DisplayName("Given a push service that redirects, when a message is posted, then the redirect is not followed")
    void should_not_follow_when_posted_given_a_redirect() {
        int status = transport(host -> new InetAddress[]{PUBLIC}).post(local("/moved"), Map.of(), new byte[]{1});

        assertThat(status).isEqualTo(302);
        assertThat(requests).containsExactly("moved");
    }

    @Test
    @DisplayName("Given a host that resolves to a private, loopback or link-local address among public ones, when a message is posted, then nothing is sent")
    void should_send_nothing_when_posted_given_a_private_resolution() {
        List<InetAddress[]> resolutions = List.of(
                new InetAddress[]{PUBLIC, address(10, 0, 0, 1)},
                new InetAddress[]{address(127, 0, 0, 1)},
                new InetAddress[]{address(169, 254, 169, 254)},
                new InetAddress[]{address(192, 168, 1, 1)},
                new InetAddress[]{});
        List<Integer> statuses = new ArrayList<>();

        for (InetAddress[] resolution : resolutions) {
            statuses.add(transport(host -> resolution).post(local("/created"), Map.of(), new byte[]{1}));
        }

        assertThat(statuses).containsOnly(HttpClientPushTransport.UNREACHABLE);
        assertThat(requests).isEmpty();
    }

    @Test
    @DisplayName("Given a host that does not resolve, when a message is posted, then it is unreachable")
    void should_be_unreachable_when_posted_given_an_unknown_host() {
        int status = transport(host -> {
            throw new UnknownHostException(host);
        }).post(local("/created"), Map.of(), new byte[]{1});

        assertThat(status).isEqualTo(HttpClientPushTransport.UNREACHABLE);
    }

    @Test
    @DisplayName("Given the production transport, when it is built, then it neither follows redirects nor waits longer than 10 seconds to connect")
    void should_bound_the_client_when_built_given_production_settings() {
        HttpClientPushTransport transport = new HttpClientPushTransport();

        assertThat(transport.client().followRedirects()).isEqualTo(HttpClient.Redirect.NEVER);
        assertThat(transport.client().connectTimeout()).contains(HttpClientPushTransport.TIMEOUT);
        assertThat(HttpClientPushTransport.TIMEOUT).hasSeconds(10);
    }

    @Test
    @DisplayName("Given a host whose name lookup never answers, when a message is posted, then it is unreachable within the lookup's time limit")
    void should_be_unreachable_within_the_limit_when_posted_given_a_lookup_that_never_answers() {
        CountDownLatch never = new CountDownLatch(1);
        HttpClientPushTransport transport = new HttpClientPushTransport(HttpClient.newBuilder().connectTimeout(HttpClientPushTransport.TIMEOUT)
                .followRedirects(HttpClient.Redirect.NEVER).proxy(HttpClient.Builder.NO_PROXY).build(), host -> {
                    never.await();
                    return new InetAddress[]{PUBLIC};
                }, Duration.ofMillis(300));
        long started = System.nanoTime();

        int status = transport.post(local("/created"), Map.of(), new byte[]{1});

        assertThat(status).isEqualTo(HttpClientPushTransport.UNREACHABLE);
        assertThat(Duration.ofNanos(System.nanoTime() - started)).isLessThan(Duration.ofSeconds(2));
        assertThat(requests).isEmpty();
    }

    private HttpClientPushTransport transport(HostResolver resolver) {
        return new HttpClientPushTransport(HttpClient.newBuilder().connectTimeout(HttpClientPushTransport.TIMEOUT)
                .followRedirects(HttpClient.Redirect.NEVER).proxy(HttpClient.Builder.NO_PROXY).build(), resolver);
    }

    private URI local(String path) {
        return URI.create("http://127.0.0.1:" + server.getAddress().getPort() + path);
    }

    private static InetAddress address(int a, int b, int c, int d) {
        try {
            return InetAddress.getByAddress(new byte[]{(byte) a, (byte) b, (byte) c, (byte) d});
        } catch (UnknownHostException impossible) {
            throw new IllegalStateException(impossible);
        }
    }
}

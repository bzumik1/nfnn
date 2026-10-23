package cz.novanadeje.app.donors.infrastructure.oauth;

import com.sun.net.httpserver.HttpServer;
import cz.novanadeje.app.donors.domain.ClientId;
import cz.novanadeje.app.donors.domain.ClientMetadata;
import cz.novanadeje.app.donors.domain.InvalidClient;
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
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class HttpClientMetadataSourceTest {

    private static final ClientId CLAUDE = new ClientId("https://claude.ai/.well-known/oauth-client");
    private static final String DOCUMENT = """
            {"client_id":"https://claude.ai/.well-known/oauth-client","client_name":"Claude","redirect_uris":["https://claude.ai/api/mcp/auth_callback"]}""";

    private HttpServer server;
    private final AtomicInteger requests = new AtomicInteger();
    private HttpClientMetadataSource source;

    @BeforeEach
    void startServer() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/json", exchange -> respond(exchange, 200, "application/json; charset=utf-8", DOCUMENT));
        server.createContext("/html", exchange -> respond(exchange, 200, "text/html", DOCUMENT));
        server.createContext("/missing", exchange -> respond(exchange, 404, "application/json", "{}"));
        server.createContext("/huge", exchange -> respond(exchange, 200, "application/json", "{\"client_id\":\"" + "x".repeat(20_000) + "\"}"));
        server.createContext("/redirect", exchange -> {
            exchange.getResponseHeaders().add("Location", "/json");
            exchange.sendResponseHeaders(302, -1);
            exchange.close();
        });
        server.start();
        source = new HttpClientMetadataSource(HttpClient.newBuilder().followRedirects(HttpClient.Redirect.NEVER).build(), new ClientMetadataDocuments(),
                true, Clock.fixed(Instant.parse("2026-10-23T10:00:00Z"), ZoneOffset.UTC));
    }

    @AfterEach
    void stopServer() {
        server.stop(0);
    }

    @Test
    @DisplayName("Given a JSON document, when it is fetched, then the metadata is parsed")
    void should_parse_when_fetched_given_json_document() {
        ClientMetadata metadata = source.fetch(local("/json"), CLAUDE);

        assertThat(metadata.displayName()).isEqualTo("Claude");
        assertThat(requests.get()).isEqualTo(1);
    }

    @Test
    @DisplayName("Given a non-JSON, missing, redirected or oversized document, when it is fetched, then the client is invalid")
    void should_refuse_when_fetched_given_bad_responses() {
        assertThatThrownBy(() -> source.fetch(local("/html"), CLAUDE)).isInstanceOf(InvalidClient.class);
        assertThatThrownBy(() -> source.fetch(local("/missing"), CLAUDE)).isInstanceOf(InvalidClient.class);
        assertThatThrownBy(() -> source.fetch(local("/redirect"), CLAUDE)).isInstanceOf(InvalidClient.class);
        assertThatThrownBy(() -> source.fetch(local("/huge"), CLAUDE)).isInstanceOf(InvalidClient.class);
    }

    @Test
    @DisplayName("Given an unreachable server, when the document is fetched, then the client is invalid")
    void should_refuse_when_fetched_given_unreachable_server() {
        server.stop(0);

        assertThatThrownBy(() -> source.fetch(local("/json"), CLAUDE)).isInstanceOf(InvalidClient.class);
    }

    @Test
    @DisplayName("Given a client id resolving to a private address, when it is fetched without the test override, then the client is invalid")
    void should_refuse_when_fetched_given_private_address() {
        HttpClientMetadataSource strict = new HttpClientMetadataSource(HttpClient.newHttpClient(), new ClientMetadataDocuments(), false,
                Clock.systemUTC());

        assertThatThrownBy(() -> strict.fetch(URI.create("http://127.0.0.1/json"), CLAUDE)).isInstanceOf(InvalidClient.class);
        assertThatThrownBy(() -> strict.fetch(URI.create("http://10.0.0.1/json"), CLAUDE)).isInstanceOf(InvalidClient.class);
    }

    private URI local(String path) {
        return URI.create("http://127.0.0.1:" + server.getAddress().getPort() + path);
    }

    private void respond(com.sun.net.httpserver.HttpExchange exchange, int status, String contentType, String body) throws IOException {
        requests.incrementAndGet();
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().add("Content-Type", contentType);
        exchange.sendResponseHeaders(status, bytes.length);
        try (OutputStream out = exchange.getResponseBody()) {
            out.write(bytes);
        }
    }
}

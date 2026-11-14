package cz.novanadeje.app.operations.infrastructure.github;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import cz.novanadeje.app.operations.application.release.LatestReleaseUnavailable;
import cz.novanadeje.app.operations.domain.release.LatestRelease;
import cz.novanadeje.app.operations.domain.release.Release;
import cz.novanadeje.app.operations.domain.release.ReleaseCheckFailure;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class GitHubReleaseSourceTest {

    private static final String PATH = "/repos/bzumik1/nfnn/releases/latest";
    private static final Duration FUNCTIONAL_TIMEOUT = Duration.ofSeconds(30);

    private final AtomicReference<Answer> answer = new AtomicReference<>();
    private final List<Optional<String>> askedAccept = new CopyOnWriteArrayList<>();
    private HttpServer server;
    private GitHubReleaseSource source;

    @BeforeEach
    void startServer() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext(PATH, exchange -> {
            askedAccept.add(Optional.ofNullable(exchange.getRequestHeaders().getFirst("Accept")));
            answer.get().send(exchange);
        });
        server.setExecutor(Executors.newVirtualThreadPerTaskExecutor());
        server.start();
        source = localSource(FUNCTIONAL_TIMEOUT);
        answer.set(Answer.json(200, release("2026.11.5", false, false)));
    }

    @AfterEach
    void stopServer() {
        server.stop(0);
    }

    @Test
    @DisplayName("Given a published release, when the latest is fetched, then its number and publication come back and GitHub's JSON is asked for")
    void should_return_release_when_fetched_given_published_release() {
        LatestRelease latest = source.fetch();

        assertThat(latest).isEqualTo(new LatestRelease(Release.parse("2026.11.5").orElseThrow(), Instant.parse("2026-11-14T09:30:12Z")));
        assertThat(askedAccept).containsExactly(Optional.of("application/vnd.github+json"));
    }



    @Test
    @DisplayName("Given a draft or a pre-release, when the latest is fetched, then the answer is refused")
    void should_refuse_answer_when_fetched_given_draft_or_prerelease() {
        answer.set(Answer.json(200, release("2026.11.5", true, false)));
        assertFailure(ReleaseCheckFailure.REFUSED_ANSWER, "refused answer");

        answer.set(Answer.json(200, release("2026.11.5", false, true)));
        assertFailure(ReleaseCheckFailure.REFUSED_ANSWER, "refused answer");
    }

    @Test
    @DisplayName("Given a tag outside the release scheme, when the latest is fetched, then the answer is refused")
    void should_refuse_answer_when_fetched_given_tag_outside_scheme() {
        answer.set(Answer.json(200, release("v2026.11.5", false, false)));

        assertFailure(ReleaseCheckFailure.REFUSED_ANSWER, "refused answer");
    }

    @Test
    @DisplayName("Given an answer that is no release object, when the latest is fetched, then the answer is refused")
    void should_refuse_answer_when_fetched_given_malformed_answer() {
        answer.set(Answer.json(200, "[\"2026.11.5\"]"));
        assertFailure(ReleaseCheckFailure.REFUSED_ANSWER, "refused answer");

        answer.set(Answer.json(200, "{\"tag_name\":"));
        assertFailure(ReleaseCheckFailure.REFUSED_ANSWER, "refused answer");

        answer.set(Answer.json(200, "{\"tag_name\":\"2026.11.5\",\"draft\":false,\"prerelease\":false,\"published_at\":\"yesterday\"}"));
        assertFailure(ReleaseCheckFailure.REFUSED_ANSWER, "refused answer");
    }

    @Test
    @DisplayName("Given an answer larger than the cap, when the latest is fetched, then it is refused as too large")
    void should_refuse_answer_when_fetched_given_too_large_answer() {
        answer.set(Answer.json(200, "{\"body\":\"" + "x".repeat(GitHubReleaseSource.MAX_BYTES) + "\"}"));

        assertFailure(ReleaseCheckFailure.TOO_LARGE, "too large");
    }

    @Test
    @DisplayName("Given GitHub's rate limit, when the latest is fetched, then the refusal is named by its status")
    void should_name_status_when_fetched_given_rate_limit() {
        answer.set(Answer.json(403, "{\"message\":\"API rate limit exceeded\"}"));

        assertFailure(ReleaseCheckFailure.STATUS, "status 403");
    }

    @Test
    @DisplayName("Given a redirect, when the latest is fetched, then it is not followed and is named by its status")
    void should_not_follow_redirect_when_fetched_given_redirect() {
        answer.set(exchange -> {
            exchange.getResponseHeaders().add("Location", "http://127.0.0.1:1/elsewhere");
            exchange.sendResponseHeaders(302, -1);
            exchange.close();
        });

        assertFailure(ReleaseCheckFailure.STATUS, "status 302");
    }

    @Test
    @DisplayName("Given a source that is not https, when the latest is fetched, then nothing is asked")
    void should_refuse_source_when_fetched_given_plain_http() {
        GitHubReleaseSource plain = new GitHubReleaseSource(http(), localUri(), false, FUNCTIONAL_TIMEOUT, host -> new InetAddress[0]);

        assertThatThrownBy(plain::fetch).isInstanceOfSatisfying(LatestReleaseUnavailable.class,
                unavailable -> assertThat(unavailable.failure()).isEqualTo(ReleaseCheckFailure.NOT_HTTPS));
        assertThat(askedAccept).isEmpty();
    }

    @Test
    @DisplayName("Given the source's name resolves to a private address, when the latest is fetched, then nothing is asked")
    void should_refuse_source_when_fetched_given_private_address() {
        GitHubReleaseSource resolvingPrivately = new GitHubReleaseSource(http(), URI.create("https://api.github.com" + PATH), false, FUNCTIONAL_TIMEOUT,
                host -> new InetAddress[]{InetAddress.getByAddress(host, new byte[]{10, 0, 0, 7})});

        assertThatThrownBy(resolvingPrivately::fetch).isInstanceOfSatisfying(LatestReleaseUnavailable.class,
                unavailable -> assertThat(unavailable.failure()).isEqualTo(ReleaseCheckFailure.NON_PUBLIC_ADDRESS));
    }

    @Test
    @DisplayName("Given a source that does not answer in time, when the latest is fetched, then it gives up with a timeout")
    void should_time_out_when_fetched_given_slow_source() {
        CountDownLatch release = new CountDownLatch(1);
        answer.set(exchange -> {
            try {
                release.await(10, TimeUnit.SECONDS);
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
            }
            exchange.close();
        });

        try {
            assertThatThrownBy(localSource(Duration.ofMillis(300))::fetch).isInstanceOfSatisfying(LatestReleaseUnavailable.class,
                    unavailable -> assertThat(unavailable.failure()).isEqualTo(ReleaseCheckFailure.TIMEOUT));
        } finally {
            release.countDown();
        }
    }

    private void assertFailure(ReleaseCheckFailure failure, String outcome) {
        assertThatThrownBy(source::fetch).isInstanceOfSatisfying(LatestReleaseUnavailable.class, unavailable -> {
            assertThat(unavailable.failure()).isEqualTo(failure);
            assertThat(unavailable.outcome()).isEqualTo(outcome);
        });
    }

    private GitHubReleaseSource localSource(Duration timeout) {
        return new GitHubReleaseSource(http(), localUri(), true, timeout, host -> new InetAddress[0]);
    }

    private URI localUri() {
        return URI.create("http://127.0.0.1:" + server.getAddress().getPort() + PATH);
    }

    private static HttpClient http() {
        return HttpClient.newBuilder().connectTimeout(FUNCTIONAL_TIMEOUT).followRedirects(HttpClient.Redirect.NEVER).build();
    }

    private static String release(String tag, boolean draft, boolean prerelease) {
        return """
                {"url":"https://api.github.com/repos/bzumik1/nfnn/releases/1","html_url":"https://github.com/bzumik1/nfnn/releases/tag/%s",
                 "tag_name":"%s","name":"%s","draft":%s,"prerelease":%s,"created_at":"2026-11-14T09:29:58Z",
                 "published_at":"2026-11-14T09:30:12Z","body":"## What's Changed\\n* Anything a pull request title says"}
                """.formatted(tag, tag, tag, draft, prerelease);
    }

    @FunctionalInterface
    private interface Answer {

        void send(HttpExchange exchange) throws IOException;

        static Answer json(int status, String body) {
            return exchange -> {
                byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().add("Content-Type", "application/json; charset=utf-8");
                exchange.sendResponseHeaders(status, bytes.length);
                try (OutputStream out = exchange.getResponseBody()) {
                    out.write(bytes);
                }
                exchange.close();
            };
        }
    }
}

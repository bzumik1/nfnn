package cz.novanadeje.app.operations.infrastructure.github;

import cz.novanadeje.app.operations.application.release.LatestReleaseSource;
import cz.novanadeje.app.operations.application.release.LatestReleaseUnavailable;
import cz.novanadeje.app.operations.domain.release.LatestRelease;
import cz.novanadeje.app.operations.domain.release.ReleaseCheckFailure;
import cz.novanadeje.app.shared.infrastructure.net.PublicAddresses;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.InputStream;
import java.net.InetAddress;
import java.net.URI;
import java.net.UnknownHostException;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import java.time.Duration;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.FutureTask;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

@Component
class GitHubReleaseSource implements LatestReleaseSource {

    static final int MAX_BYTES = 256 * 1024;

    private static final Duration TIMEOUT = Duration.ofSeconds(10);
    private static final int OK = 200;
    private static final String ACCEPT = "application/vnd.github+json";
    private static final String USER_AGENT = "nfnn-release-check";

    private final HttpClient http;
    private final URI source;
    private final boolean privateAddressesAllowed;
    private final Duration timeout;
    private final HostResolver resolver;
    private final GitHubReleaseAnswer answers = new GitHubReleaseAnswer();

    @Autowired
    GitHubReleaseSource(ReleaseSourceProperties properties) {
        this(HttpClient.newBuilder().connectTimeout(TIMEOUT).followRedirects(HttpClient.Redirect.NEVER).build(), properties.source(), false, TIMEOUT,
                InetAddress::getAllByName);
    }

    GitHubReleaseSource(HttpClient http, URI source, boolean privateAddressesAllowed, Duration timeout, HostResolver resolver) {
        this.http = http;
        this.source = source;
        this.privateAddressesAllowed = privateAddressesAllowed;
        this.timeout = timeout;
        this.resolver = resolver;
    }

    @Override
    public LatestRelease fetch() {
        long deadline = System.nanoTime() + timeout.toNanos();
        requireSafeTarget(deadline);
        HttpRequest request = HttpRequest.newBuilder(source).timeout(Duration.ofNanos(remaining(deadline)))
                .header("Accept", ACCEPT).header("User-Agent", USER_AGENT).GET().build();
        HttpResponse<InputStream> response = send(request);
        try (InputStream body = response.body()) {
            if (response.statusCode() != OK) {
                throw LatestReleaseUnavailable.status(response.statusCode());
            }
            return answers.parse(readBounded(body, deadline));
        } catch (IOException unreadable) {
            throw new LatestReleaseUnavailable(ReleaseCheckFailure.UNREACHABLE);
        }
    }

    private void requireSafeTarget(long deadline) {
        if (privateAddressesAllowed) {
            return;
        }
        if (!"https".equals(source.getScheme())) {
            throw new LatestReleaseUnavailable(ReleaseCheckFailure.NOT_HTTPS);
        }
        for (InetAddress address : resolveBounded(source.getHost(), deadline)) {
            if (!PublicAddresses.isPublic(address)) {
                throw new LatestReleaseUnavailable(ReleaseCheckFailure.NON_PUBLIC_ADDRESS);
            }
        }
    }

    private InetAddress[] resolveBounded(String host, long deadline) {
        FutureTask<InetAddress[]> lookup = new FutureTask<>(() -> resolver.resolve(host));
        Thread.ofVirtual().name("release-check-lookup").start(lookup);
        try {
            return lookup.get(remaining(deadline), TimeUnit.NANOSECONDS);
        } catch (TimeoutException slow) {
            lookup.cancel(true);
            throw new LatestReleaseUnavailable(ReleaseCheckFailure.TIMEOUT);
        } catch (ExecutionException failed) {
            throw new LatestReleaseUnavailable(failed.getCause() instanceof UnknownHostException ? ReleaseCheckFailure.UNKNOWN_HOST : ReleaseCheckFailure.UNREACHABLE);
        } catch (InterruptedException interrupted) {
            lookup.cancel(true);
            Thread.currentThread().interrupt();
            throw new LatestReleaseUnavailable(ReleaseCheckFailure.INTERRUPTED);
        }
    }

    private static long remaining(long deadline) {
        long remaining = deadline - System.nanoTime();
        if (remaining <= 0) {
            throw new LatestReleaseUnavailable(ReleaseCheckFailure.TIMEOUT);
        }
        return remaining;
    }

    private HttpResponse<InputStream> send(HttpRequest request) {
        try {
            return http.send(request, HttpResponse.BodyHandlers.ofInputStream());
        } catch (HttpTimeoutException slow) {
            throw new LatestReleaseUnavailable(ReleaseCheckFailure.TIMEOUT);
        } catch (IOException unreachable) {
            throw new LatestReleaseUnavailable(ReleaseCheckFailure.UNREACHABLE);
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw new LatestReleaseUnavailable(ReleaseCheckFailure.INTERRUPTED);
        }
    }

    private static byte[] readBounded(InputStream body, long deadline) throws IOException {
        try (ExecutorService reader = Executors.newVirtualThreadPerTaskExecutor()) {
            Future<byte[]> read = reader.submit(() -> body.readNBytes(MAX_BYTES + 1));
            byte[] bytes;
            try {
                bytes = read.get(Math.max(0, deadline - System.nanoTime()), TimeUnit.NANOSECONDS);
            } catch (TimeoutException slow) {
                read.cancel(true);
                body.close();
                throw new LatestReleaseUnavailable(ReleaseCheckFailure.TIMEOUT);
            } catch (ExecutionException failed) {
                throw new LatestReleaseUnavailable(ReleaseCheckFailure.UNREACHABLE);
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
                throw new LatestReleaseUnavailable(ReleaseCheckFailure.INTERRUPTED);
            }
            if (bytes.length > MAX_BYTES) {
                throw new LatestReleaseUnavailable(ReleaseCheckFailure.TOO_LARGE);
            }
            return bytes;
        }
    }
}

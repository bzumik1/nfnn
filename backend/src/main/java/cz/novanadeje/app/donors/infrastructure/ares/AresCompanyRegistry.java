package cz.novanadeje.app.donors.infrastructure.ares;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import cz.novanadeje.app.donors.application.CompanyRegistry;
import cz.novanadeje.app.donors.application.CompanyRegistryUnavailable;
import cz.novanadeje.app.donors.domain.CompanyIdentifier;
import cz.novanadeje.app.donors.domain.RegisteredCompany;
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
import java.time.Clock;
import java.time.Duration;
import java.util.Optional;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

@Component
class AresCompanyRegistry implements CompanyRegistry {

    static final URI ARES = URI.create("https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/");

    private static final Duration TIMEOUT = Duration.ofSeconds(3);
    private static final Duration CACHE_TTL = Duration.ofMinutes(10);
    private static final int CACHE_SIZE = 1_000;
    private static final int MAX_BYTES = 64 * 1024;
    private static final int OK = 200;
    private static final int NOT_FOUND = 404;

    private final HttpClient http;
    private final URI base;
    private final boolean privateAddressesAllowed;
    private final Duration timeout;
    private final AresAnswers answers = new AresAnswers();
    private final Cache<CompanyIdentifier, Optional<RegisteredCompany>> cache;

    @Autowired
    AresCompanyRegistry(Clock clock) {
        this(HttpClient.newBuilder().connectTimeout(TIMEOUT).followRedirects(HttpClient.Redirect.NEVER).build(), ARES, false, TIMEOUT, clock);
    }

    AresCompanyRegistry(HttpClient http, URI base, boolean privateAddressesAllowed, Duration timeout, Clock clock) {
        this.http = http;
        this.base = base;
        this.privateAddressesAllowed = privateAddressesAllowed;
        this.timeout = timeout;
        this.cache = Caffeine.newBuilder()
                .maximumSize(CACHE_SIZE)
                .expireAfterWrite(CACHE_TTL)
                .ticker(() -> TimeUnit.MILLISECONDS.toNanos(clock.millis()))
                .build();
    }

    @Override
    public Optional<RegisteredCompany> find(CompanyIdentifier identifier) {
        return cache.get(identifier, this::ask);
    }

    private Optional<RegisteredCompany> ask(CompanyIdentifier identifier) {
        long deadline = System.nanoTime() + timeout.toNanos();
        requireSafeTarget();
        HttpRequest request = HttpRequest.newBuilder(base.resolve(identifier.value()))
                .timeout(timeout)
                .header("Accept", "application/json")
                .GET()
                .build();
        HttpResponse<InputStream> response = send(request);
        try (InputStream body = response.body()) {
            if (response.statusCode() == NOT_FOUND) {
                return Optional.empty();
            }
            if (response.statusCode() != OK) {
                throw new CompanyRegistryUnavailable("status " + response.statusCode());
            }
            String contentType = response.headers().firstValue("Content-Type").orElse("");
            if (!contentType.toLowerCase().startsWith("application/json")) {
                throw new CompanyRegistryUnavailable(AresAnswers.UNEXPECTED);
            }
            return Optional.of(answers.parse(readBounded(body, deadline), identifier));
        } catch (IOException unreadable) {
            throw new CompanyRegistryUnavailable("unreachable");
        }
    }

    private void requireSafeTarget() {
        if (privateAddressesAllowed) {
            return;
        }
        if (!"https".equals(base.getScheme())) {
            throw new CompanyRegistryUnavailable("not https");
        }
        InetAddress[] addresses;
        try {
            addresses = InetAddress.getAllByName(base.getHost());
        } catch (UnknownHostException unknown) {
            throw new CompanyRegistryUnavailable("unknown host");
        }
        for (InetAddress address : addresses) {
            if (!PublicAddresses.isPublic(address)) {
                throw new CompanyRegistryUnavailable("non-public address");
            }
        }
    }

    private HttpResponse<InputStream> send(HttpRequest request) {
        try {
            return http.send(request, HttpResponse.BodyHandlers.ofInputStream());
        } catch (HttpTimeoutException slow) {
            throw new CompanyRegistryUnavailable("timeout");
        } catch (IOException unreachable) {
            throw new CompanyRegistryUnavailable("unreachable");
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw new CompanyRegistryUnavailable("interrupted");
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
                throw new CompanyRegistryUnavailable("timeout");
            } catch (ExecutionException failed) {
                throw new CompanyRegistryUnavailable("unreachable");
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
                throw new CompanyRegistryUnavailable("interrupted");
            }
            if (bytes.length > MAX_BYTES) {
                throw new CompanyRegistryUnavailable("too large");
            }
            return bytes;
        }
    }
}

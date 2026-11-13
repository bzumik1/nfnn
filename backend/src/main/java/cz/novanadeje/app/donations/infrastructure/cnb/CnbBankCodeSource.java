package cz.novanadeje.app.donations.infrastructure.cnb;

import cz.novanadeje.app.donations.application.bankcode.BankCodeFetch;
import cz.novanadeje.app.donations.application.bankcode.BankCodeSource;
import cz.novanadeje.app.donations.application.bankcode.BankCodeSourceFailure;
import cz.novanadeje.app.donations.application.bankcode.BankCodeSourceUnavailable;
import cz.novanadeje.app.donations.domain.bankcode.BankCodeList;
import cz.novanadeje.app.donations.domain.bankcode.BankCodeListState;
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
class CnbBankCodeSource implements BankCodeSource {

    private static final Duration TIMEOUT = Duration.ofSeconds(10);
    private static final int MAX_BYTES = 64 * 1024;
    private static final int OK = 200;
    private static final int NOT_MODIFIED = 304;

    private final HttpClient http;
    private final URI source;
    private final boolean privateAddressesAllowed;
    private final Duration timeout;
    private final HostResolver resolver;

    @Autowired
    CnbBankCodeSource(BankCodeProperties properties) {
        this(HttpClient.newBuilder().connectTimeout(TIMEOUT).followRedirects(HttpClient.Redirect.NEVER).build(), properties.source(), false, TIMEOUT);
    }

    CnbBankCodeSource(HttpClient http, URI source, boolean privateAddressesAllowed, Duration timeout) {
        this(http, source, privateAddressesAllowed, timeout, InetAddress::getAllByName);
    }

    CnbBankCodeSource(HttpClient http, URI source, boolean privateAddressesAllowed, Duration timeout, HostResolver resolver) {
        this.http = http;
        this.source = source;
        this.privateAddressesAllowed = privateAddressesAllowed;
        this.timeout = timeout;
        this.resolver = resolver;
    }

    @Override
    public BankCodeFetch fetch(BankCodeListState known) {
        long deadline = System.nanoTime() + timeout.toNanos();
        requireSafeTarget(deadline);
        HttpRequest.Builder request = HttpRequest.newBuilder(source).timeout(Duration.ofNanos(remaining(deadline))).GET();
        known.sourceLastModified().ifPresent(lastModified -> request.header("If-Modified-Since", lastModified));
        HttpResponse<InputStream> response = send(request.build());
        try (InputStream body = response.body()) {
            if (response.statusCode() == NOT_MODIFIED) {
                return new BankCodeFetch.Unchanged();
            }
            if (response.statusCode() != OK) {
                throw BankCodeSourceUnavailable.status(response.statusCode());
            }
            return new BankCodeFetch.Fetched(parse(readBounded(body, deadline)), response.headers().firstValue("Last-Modified"));
        } catch (IOException unreadable) {
            throw new BankCodeSourceUnavailable(BankCodeSourceFailure.UNREACHABLE);
        }
    }

    private static BankCodeList parse(byte[] bytes) {
        try {
            return CnbBankCodeCsv.parse(bytes);
        } catch (IllegalArgumentException refused) {
            throw new BankCodeSourceUnavailable(BankCodeSourceFailure.REFUSED_LIST);
        }
    }

    private void requireSafeTarget(long deadline) {
        if (privateAddressesAllowed) {
            return;
        }
        if (!"https".equals(source.getScheme())) {
            throw new BankCodeSourceUnavailable(BankCodeSourceFailure.NOT_HTTPS);
        }
        for (InetAddress address : resolveBounded(source.getHost(), deadline)) {
            if (!PublicAddresses.isPublic(address)) {
                throw new BankCodeSourceUnavailable(BankCodeSourceFailure.NON_PUBLIC_ADDRESS);
            }
        }
    }

    private InetAddress[] resolveBounded(String host, long deadline) {
        FutureTask<InetAddress[]> lookup = new FutureTask<>(() -> resolver.resolve(host));
        Thread.ofVirtual().name("bank-code-lookup").start(lookup);
        try {
            return lookup.get(remaining(deadline), TimeUnit.NANOSECONDS);
        } catch (TimeoutException slow) {
            lookup.cancel(true);
            throw new BankCodeSourceUnavailable(BankCodeSourceFailure.TIMEOUT);
        } catch (ExecutionException failed) {
            throw new BankCodeSourceUnavailable(failed.getCause() instanceof UnknownHostException ? BankCodeSourceFailure.UNKNOWN_HOST : BankCodeSourceFailure.UNREACHABLE);
        } catch (InterruptedException interrupted) {
            lookup.cancel(true);
            Thread.currentThread().interrupt();
            throw new BankCodeSourceUnavailable(BankCodeSourceFailure.INTERRUPTED);
        }
    }

    private static long remaining(long deadline) {
        long remaining = deadline - System.nanoTime();
        if (remaining <= 0) {
            throw new BankCodeSourceUnavailable(BankCodeSourceFailure.TIMEOUT);
        }
        return remaining;
    }

    private HttpResponse<InputStream> send(HttpRequest request) {
        try {
            return http.send(request, HttpResponse.BodyHandlers.ofInputStream());
        } catch (HttpTimeoutException slow) {
            throw new BankCodeSourceUnavailable(BankCodeSourceFailure.TIMEOUT);
        } catch (IOException unreachable) {
            throw new BankCodeSourceUnavailable(BankCodeSourceFailure.UNREACHABLE);
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw new BankCodeSourceUnavailable(BankCodeSourceFailure.INTERRUPTED);
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
                throw new BankCodeSourceUnavailable(BankCodeSourceFailure.TIMEOUT);
            } catch (ExecutionException failed) {
                throw new BankCodeSourceUnavailable(BankCodeSourceFailure.UNREACHABLE);
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
                throw new BankCodeSourceUnavailable(BankCodeSourceFailure.INTERRUPTED);
            }
            if (bytes.length > MAX_BYTES) {
                throw new BankCodeSourceUnavailable(BankCodeSourceFailure.TOO_LARGE);
            }
            return bytes;
        }
    }
}

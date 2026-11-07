package cz.novanadeje.app.donations.infrastructure.cnb;

import cz.novanadeje.app.donations.application.bankcode.BankCodeFetch;
import cz.novanadeje.app.donations.application.bankcode.BankCodeSource;
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

    @Autowired
    CnbBankCodeSource(BankCodeProperties properties) {
        this(HttpClient.newBuilder().connectTimeout(TIMEOUT).followRedirects(HttpClient.Redirect.NEVER).build(), properties.source(), false, TIMEOUT);
    }

    CnbBankCodeSource(HttpClient http, URI source, boolean privateAddressesAllowed, Duration timeout) {
        this.http = http;
        this.source = source;
        this.privateAddressesAllowed = privateAddressesAllowed;
        this.timeout = timeout;
    }

    @Override
    public BankCodeFetch fetch(BankCodeListState known) {
        long deadline = System.nanoTime() + timeout.toNanos();
        requireSafeTarget();
        HttpRequest.Builder request = HttpRequest.newBuilder(source).timeout(timeout).GET();
        known.ifModifiedSince().ifPresent(lastModified -> request.header("If-Modified-Since", lastModified));
        HttpResponse<InputStream> response = send(request.build());
        try (InputStream body = response.body()) {
            if (response.statusCode() == NOT_MODIFIED) {
                return new BankCodeFetch.Unchanged();
            }
            if (response.statusCode() != OK) {
                throw new BankCodeSourceUnavailable("status " + response.statusCode());
            }
            return new BankCodeFetch.Fetched(parse(readBounded(body, deadline)), response.headers().firstValue("Last-Modified"));
        } catch (IOException unreadable) {
            throw new BankCodeSourceUnavailable("unreachable");
        }
    }

    private static BankCodeList parse(byte[] bytes) {
        try {
            return CnbBankCodeCsv.parse(bytes);
        } catch (IllegalArgumentException refused) {
            throw new BankCodeSourceUnavailable("refused list");
        }
    }

    private void requireSafeTarget() {
        if (privateAddressesAllowed) {
            return;
        }
        if (!"https".equals(source.getScheme())) {
            throw new BankCodeSourceUnavailable("not https");
        }
        InetAddress[] addresses;
        try {
            addresses = InetAddress.getAllByName(source.getHost());
        } catch (UnknownHostException unknown) {
            throw new BankCodeSourceUnavailable("unknown host");
        }
        for (InetAddress address : addresses) {
            if (!PublicAddresses.isPublic(address)) {
                throw new BankCodeSourceUnavailable("non-public address");
            }
        }
    }

    private HttpResponse<InputStream> send(HttpRequest request) {
        try {
            return http.send(request, HttpResponse.BodyHandlers.ofInputStream());
        } catch (HttpTimeoutException slow) {
            throw new BankCodeSourceUnavailable("timeout");
        } catch (IOException unreachable) {
            throw new BankCodeSourceUnavailable("unreachable");
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw new BankCodeSourceUnavailable("interrupted");
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
                throw new BankCodeSourceUnavailable("timeout");
            } catch (ExecutionException failed) {
                throw new BankCodeSourceUnavailable("unreachable");
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
                throw new BankCodeSourceUnavailable("interrupted");
            }
            if (bytes.length > MAX_BYTES) {
                throw new BankCodeSourceUnavailable("too large");
            }
            return bytes;
        }
    }
}

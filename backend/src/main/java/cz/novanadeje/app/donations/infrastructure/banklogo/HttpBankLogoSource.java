package cz.novanadeje.app.donations.infrastructure.banklogo;

import cz.novanadeje.app.donations.application.banklogo.BankLogoImages;
import cz.novanadeje.app.donations.application.banklogo.BankLogoUnavailable;
import cz.novanadeje.app.donations.application.banklogo.FetchedBankLogo;
import cz.novanadeje.app.donations.domain.banklogo.BankLogoFailure;
import cz.novanadeje.app.donations.domain.banklogo.BankLogoSource;
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
import java.util.function.Function;

@Component
class HttpBankLogoSource implements BankLogoImages {

    static final String USER_AGENT = "nfnn.cz bank logos";
    static final int MAX_BYTES = 1024 * 1024;
    private static final Duration TIMEOUT = Duration.ofSeconds(10);
    private static final String ACCEPT = "image/png, image/jpeg";
    private static final int OK = 200;
    private static final int FIRST_REDIRECT = 300;
    private static final int LAST_REDIRECT = 399;

    private final HttpClient http;
    private final Function<BankLogoSource, URI> target;
    private final boolean privateAddressesAllowed;
    private final Duration timeout;
    private final HostResolver resolver;

    @Autowired
    HttpBankLogoSource() {
        this(client(), BankLogoSource::uri, false, TIMEOUT, InetAddress::getAllByName);
    }

    HttpBankLogoSource(HttpClient http, Function<BankLogoSource, URI> target, boolean privateAddressesAllowed, Duration timeout, HostResolver resolver) {
        this.http = http;
        this.target = target;
        this.privateAddressesAllowed = privateAddressesAllowed;
        this.timeout = timeout;
        this.resolver = resolver;
    }

    static HttpClient client() {
        return HttpClient.newBuilder().connectTimeout(TIMEOUT).followRedirects(HttpClient.Redirect.NEVER).build();
    }

    @Override
    public FetchedBankLogo fetch(BankLogoSource source) {
        long deadline = System.nanoTime() + timeout.toNanos();
        if (!privateAddressesAllowed) {
            requirePublic(source.host(), deadline);
        }
        HttpRequest request = HttpRequest.newBuilder(target.apply(source)).timeout(Duration.ofNanos(remaining(deadline)))
                .header("Accept", ACCEPT).header("User-Agent", USER_AGENT).GET().build();
        HttpResponse<InputStream> response = send(request);
        try (InputStream body = response.body()) {
            int status = response.statusCode();
            if (status >= FIRST_REDIRECT && status <= LAST_REDIRECT) {
                throw new BankLogoUnavailable(BankLogoFailure.REDIRECTED);
            }
            if (status != OK) {
                throw new BankLogoUnavailable(BankLogoFailure.STATUS);
            }
            if (response.headers().firstValueAsLong("Content-Length").orElse(0) > MAX_BYTES) {
                throw new BankLogoUnavailable(BankLogoFailure.TOO_LARGE);
            }
            byte[] bytes = readBounded(body, deadline);
            return FetchedBankLogo.of(BankLogoPictures.toWebp(bytes, response.headers().firstValue("Content-Type").orElse("")));
        } catch (IOException unreadable) {
            throw new BankLogoUnavailable(BankLogoFailure.UNREACHABLE);
        }
    }

    private void requirePublic(String host, long deadline) {
        for (InetAddress address : resolveBounded(host, deadline)) {
            if (!PublicAddresses.isPublic(address)) {
                throw new BankLogoUnavailable(BankLogoFailure.NON_PUBLIC_ADDRESS);
            }
        }
    }

    private InetAddress[] resolveBounded(String host, long deadline) {
        FutureTask<InetAddress[]> lookup = new FutureTask<>(() -> resolver.resolve(host));
        Thread.ofVirtual().name("bank-logo-lookup").start(lookup);
        try {
            return lookup.get(remaining(deadline), TimeUnit.NANOSECONDS);
        } catch (TimeoutException slow) {
            lookup.cancel(true);
            throw new BankLogoUnavailable(BankLogoFailure.TIMEOUT);
        } catch (ExecutionException failed) {
            throw new BankLogoUnavailable(failed.getCause() instanceof UnknownHostException ? BankLogoFailure.UNKNOWN_HOST : BankLogoFailure.UNREACHABLE);
        } catch (InterruptedException interrupted) {
            lookup.cancel(true);
            Thread.currentThread().interrupt();
            throw new BankLogoUnavailable(BankLogoFailure.INTERRUPTED);
        }
    }

    private static long remaining(long deadline) {
        long remaining = deadline - System.nanoTime();
        if (remaining <= 0) {
            throw new BankLogoUnavailable(BankLogoFailure.TIMEOUT);
        }
        return remaining;
    }

    private HttpResponse<InputStream> send(HttpRequest request) {
        try {
            return http.send(request, HttpResponse.BodyHandlers.ofInputStream());
        } catch (HttpTimeoutException slow) {
            throw new BankLogoUnavailable(BankLogoFailure.TIMEOUT);
        } catch (IOException unreachable) {
            throw new BankLogoUnavailable(BankLogoFailure.UNREACHABLE);
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw new BankLogoUnavailable(BankLogoFailure.INTERRUPTED);
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
                throw new BankLogoUnavailable(BankLogoFailure.TIMEOUT);
            } catch (ExecutionException failed) {
                throw new BankLogoUnavailable(BankLogoFailure.UNREACHABLE);
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
                throw new BankLogoUnavailable(BankLogoFailure.INTERRUPTED);
            }
            if (bytes.length > MAX_BYTES) {
                throw new BankLogoUnavailable(BankLogoFailure.TOO_LARGE);
            }
            return bytes;
        }
    }
}

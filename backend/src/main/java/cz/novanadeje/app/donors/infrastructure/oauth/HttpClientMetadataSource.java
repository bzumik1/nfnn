package cz.novanadeje.app.donors.infrastructure.oauth;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import cz.novanadeje.app.donors.application.ClientMetadataSource;
import cz.novanadeje.app.donors.domain.ClientId;
import cz.novanadeje.app.donors.domain.ClientMetadata;
import cz.novanadeje.app.donors.domain.InvalidClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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
import java.time.Duration;
import java.util.concurrent.TimeUnit;

@Component
class HttpClientMetadataSource implements ClientMetadataSource {

    private static final Logger log = LoggerFactory.getLogger(HttpClientMetadataSource.class);
    private static final Duration TIMEOUT = Duration.ofSeconds(5);
    private static final Duration CACHE_TTL = Duration.ofHours(1);
    private static final int MAX_BYTES = 16 * 1024;

    private final HttpClient http;
    private final ClientMetadataDocuments documents;
    private final boolean privateAddressesAllowed;
    private final Cache<ClientId, ClientMetadata> cache;

    @Autowired
    HttpClientMetadataSource(ClientMetadataDocuments documents, java.time.Clock clock) {
        this(HttpClient.newBuilder().connectTimeout(TIMEOUT).followRedirects(HttpClient.Redirect.NEVER).build(), documents, false, clock);
    }

    HttpClientMetadataSource(HttpClient http, ClientMetadataDocuments documents, boolean privateAddressesAllowed, java.time.Clock clock) {
        this.http = http;
        this.documents = documents;
        this.privateAddressesAllowed = privateAddressesAllowed;
        this.cache = Caffeine.newBuilder()
                .maximumSize(100)
                .expireAfterWrite(CACHE_TTL)
                .ticker(() -> TimeUnit.MILLISECONDS.toNanos(clock.millis()))
                .build();
    }

    @Override
    public ClientMetadata fetch(ClientId clientId) {
        return cache.get(clientId, id -> fetch(URI.create(id.value()), id));
    }

    ClientMetadata fetch(URI documentUri, ClientId clientId) {
        requirePublicHost(documentUri);
        HttpRequest request = HttpRequest.newBuilder(documentUri)
                .timeout(TIMEOUT)
                .header("Accept", "application/json")
                .GET()
                .build();
        HttpResponse<InputStream> response;
        try {
            response = http.send(request, HttpResponse.BodyHandlers.ofInputStream());
        } catch (IOException unreachable) {
            log.warn("The client metadata document of {} could not be read: {}", clientId.host(), unreachable.getClass().getSimpleName());
            throw new InvalidClient("the client metadata document could not be read");
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw new InvalidClient("the client metadata document could not be read");
        }
        if (response.statusCode() != 200) {
            log.warn("The client metadata document of {} answered {}", clientId.host(), response.statusCode());
            throw new InvalidClient("the client metadata document answered " + response.statusCode());
        }
        String contentType = response.headers().firstValue("Content-Type").orElse("");
        if (!contentType.toLowerCase().startsWith("application/json")) {
            throw new InvalidClient("the client metadata document is not JSON");
        }
        byte[] body = readBounded(response.body());
        return documents.parse(body, clientId);
    }

    private void requirePublicHost(URI documentUri) {
        if (privateAddressesAllowed) {
            return;
        }
        InetAddress[] addresses;
        try {
            addresses = InetAddress.getAllByName(documentUri.getHost());
        } catch (UnknownHostException unknown) {
            throw new InvalidClient("the client host is unknown");
        }
        for (InetAddress address : addresses) {
            if (address.isLoopbackAddress() || address.isSiteLocalAddress() || address.isLinkLocalAddress() || address.isAnyLocalAddress()
                    || address.isMulticastAddress() || isCarrierGradeNat(address)) {
                throw new InvalidClient("the client host must be a public address");
            }
        }
    }

    private static boolean isCarrierGradeNat(InetAddress address) {
        byte[] octets = address.getAddress();
        return octets.length == 4 && (octets[0] & 0xff) == 100 && (octets[1] & 0xc0) == 64;
    }

    private static byte[] readBounded(InputStream body) {
        try (body) {
            byte[] bytes = body.readNBytes(MAX_BYTES + 1);
            if (bytes.length > MAX_BYTES) {
                throw new InvalidClient("the client metadata document is too large");
            }
            return bytes;
        } catch (IOException failed) {
            throw new InvalidClient("the client metadata document could not be read");
        }
    }
}

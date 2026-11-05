package cz.novanadeje.app.operations.infrastructure.push;

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
import java.time.Duration;
import java.util.Arrays;
import java.util.Map;

@Component
class HttpClientPushTransport implements PushTransport {

    static final Duration TIMEOUT = Duration.ofSeconds(10);
    static final int UNREACHABLE = 0;

    private final HttpClient client;
    private final HostResolver resolver;

    @Autowired
    HttpClientPushTransport() {
        this(HttpClient.newBuilder().connectTimeout(TIMEOUT).followRedirects(HttpClient.Redirect.NEVER).build(), InetAddress::getAllByName);
    }

    HttpClientPushTransport(HttpClient client, HostResolver resolver) {
        this.client = client;
        this.resolver = resolver;
    }

    HttpClient client() {
        return client;
    }

    @Override
    public int post(URI endpoint, Map<String, String> headers, byte[] body) {
        if (!resolvesOnlyToPublicAddresses(endpoint.getHost())) {
            return UNREACHABLE;
        }
        HttpRequest.Builder request = HttpRequest.newBuilder(endpoint).timeout(TIMEOUT).POST(HttpRequest.BodyPublishers.ofByteArray(body));
        headers.forEach(request::header);
        try {
            HttpResponse<InputStream> response = client.send(request.build(), HttpResponse.BodyHandlers.ofInputStream());
            response.body().close();
            return response.statusCode();
        } catch (IOException unreachable) {
            return UNREACHABLE;
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            return UNREACHABLE;
        }
    }

    private boolean resolvesOnlyToPublicAddresses(String host) {
        try {
            InetAddress[] addresses = resolver.resolve(host);
            return addresses.length > 0 && Arrays.stream(addresses).allMatch(PublicAddresses::isPublic);
        } catch (UnknownHostException unknown) {
            return false;
        }
    }

    @FunctionalInterface
    interface HostResolver {
        InetAddress[] resolve(String host) throws UnknownHostException;
    }
}

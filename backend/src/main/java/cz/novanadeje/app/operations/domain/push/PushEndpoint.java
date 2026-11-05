package cz.novanadeje.app.operations.domain.push;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Locale;
import java.util.regex.Pattern;

public record PushEndpoint(String value) {

    public static final int MAX_LENGTH = 1024;
    private static final Pattern HOST_NAME = Pattern.compile("[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+");
    private static final int HTTPS_PORT = 443;

    public PushEndpoint {
        if (value == null || value.length() > MAX_LENGTH || !value.startsWith("https://")) {
            throw new PushEndpointRefused();
        }
        URI uri = parse(value);
        if (uri.getRawUserInfo() != null || uri.getRawFragment() != null || (uri.getPort() != -1 && uri.getPort() != HTTPS_PORT)) {
            throw new PushEndpointRefused();
        }
        String host = uri.getHost();
        if (host == null || !host.equals(host.toLowerCase(Locale.ROOT)) || !HOST_NAME.matcher(host).matches() || PushService.ofHost(host).isEmpty()) {
            throw new PushEndpointRefused();
        }
    }

    public URI uri() {
        return URI.create(value);
    }

    public String host() {
        return uri().getHost();
    }

    public String origin() {
        return "https://" + host();
    }

    public PushService service() {
        return PushService.ofHost(host()).orElseThrow();
    }

    @Override
    public String toString() {
        return "PushEndpoint[" + service() + "]";
    }

    private static URI parse(String value) {
        try {
            URI uri = new URI(value);
            if (!"https".equals(uri.getScheme()) || uri.isOpaque()) {
                throw new PushEndpointRefused();
            }
            return uri;
        } catch (URISyntaxException malformed) {
            throw new PushEndpointRefused();
        }
    }
}

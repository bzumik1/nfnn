package cz.novanadeje.app.donors.domain;

import java.net.URI;
import java.net.URISyntaxException;

public record ClientId(String value) {

    public static final int MAX_LENGTH = 512;

    public ClientId {
        if (value == null || value.isBlank()) {
            throw new InvalidClient("client_id is required");
        }
        if (value.length() > MAX_LENGTH) {
            throw new InvalidClient("client_id is too long");
        }
        URI parsed = parse(value);
        if (!"https".equals(parsed.getScheme())) {
            throw new InvalidClient("client_id must be an https address");
        }
        if (parsed.getHost() == null || parsed.getHost().isBlank()) {
            throw new InvalidClient("client_id must name a host");
        }
        if (parsed.getRawFragment() != null || parsed.getRawUserInfo() != null) {
            throw new InvalidClient("client_id must carry no fragment or user information");
        }
    }

    public String host() {
        return parse(value).getHost();
    }

    private static URI parse(String value) {
        try {
            return new URI(value);
        } catch (URISyntaxException malformed) {
            throw new InvalidClient("client_id is not a valid address");
        }
    }
}

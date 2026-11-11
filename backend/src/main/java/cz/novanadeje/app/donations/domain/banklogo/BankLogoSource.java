package cz.novanadeje.app.donations.domain.banklogo;

import cz.novanadeje.app.donations.domain.bankcode.BankCode;

import java.net.URI;
import java.net.URISyntaxException;

public record BankLogoSource(BankCode bank, String url) {

    public static final int MAX_LENGTH = 500;
    private static final String SCHEME = "https";
    private static final int HTTPS_PORT = 443;

    public BankLogoSource {
        if (bank == null) {
            throw new IllegalArgumentException("A bank logo source belongs to a bank");
        }
        if (url == null || url.isEmpty() || url.length() > MAX_LENGTH || !url.startsWith(SCHEME + "://") || url.chars().anyMatch(BankLogoSource::isRefusedCharacter)) {
            throw new BankLogoSourceInvalid();
        }
        URI uri = parse(url);
        if (uri.getRawUserInfo() != null || uri.getRawQuery() != null || uri.getRawFragment() != null
                || (uri.getPort() != -1 && uri.getPort() != HTTPS_PORT)) {
            throw new BankLogoSourceInvalid();
        }
        String host = uri.getHost();
        if (host == null || !BankLogoHosts.admit(host, bank)) {
            throw new BankLogoSourceInvalid();
        }
    }

    public URI uri() {
        return URI.create(url);
    }

    public String host() {
        return uri().getHost();
    }

    private static boolean isRefusedCharacter(int character) {
        return character <= 0x20 || character == 0x7f || character > 0x7e;
    }

    private static URI parse(String url) {
        try {
            URI uri = new URI(url);
            if (!SCHEME.equals(uri.getScheme()) || uri.isOpaque()) {
                throw new BankLogoSourceInvalid();
            }
            return uri;
        } catch (URISyntaxException malformed) {
            throw new BankLogoSourceInvalid();
        }
    }
}

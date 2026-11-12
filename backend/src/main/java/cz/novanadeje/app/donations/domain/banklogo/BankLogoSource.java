package cz.novanadeje.app.donations.domain.banklogo;

import cz.novanadeje.app.donations.domain.bankcode.BankCode;

import java.net.URI;
import java.net.URISyntaxException;

public record BankLogoSource(BankCode bank, String url, boolean allowed) {

    public static final int MAX_LENGTH = 500;
    private static final String SCHEME = "https";
    private static final int HTTPS_PORT = 443;

    public BankLogoSource {
        if (bank == null) {
            throw new IllegalArgumentException("A bank logo source belongs to a bank");
        }
        if (url == null || url.isEmpty() || url.length() > MAX_LENGTH) {
            throw new BankLogoSourceInvalid();
        }
        if (allowed && !admits(bank, url)) {
            throw new BankLogoSourceInvalid();
        }
    }

    public BankLogoSource(BankCode bank, String url) {
        this(bank, url, true);
    }

    public static BankLogoSource stored(BankCode bank, String url) {
        return new BankLogoSource(bank, url, bank != null && url != null && admits(bank, url));
    }

    public URI uri() {
        return URI.create(url);
    }

    public String host() {
        return uri().getHost();
    }

    private static boolean admits(BankCode bank, String url) {
        if (!url.startsWith(SCHEME + "://") || url.chars().anyMatch(BankLogoSource::isRefusedCharacter)) {
            return false;
        }
        try {
            URI uri = new URI(url);
            return SCHEME.equals(uri.getScheme()) && !uri.isOpaque() && uri.getRawUserInfo() == null && uri.getRawQuery() == null
                    && uri.getRawFragment() == null && (uri.getPort() == -1 || uri.getPort() == HTTPS_PORT)
                    && uri.getHost() != null && BankLogoHosts.admit(uri.getHost(), bank);
        } catch (URISyntaxException malformed) {
            return false;
        }
    }

    private static boolean isRefusedCharacter(int character) {
        return character <= 0x20 || character == 0x7f || character > 0x7e;
    }
}

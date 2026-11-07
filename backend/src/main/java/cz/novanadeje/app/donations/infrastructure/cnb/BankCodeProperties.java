package cz.novanadeje.app.donations.infrastructure.cnb;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.net.URI;

@ConfigurationProperties("app.donations.bank-codes")
public record BankCodeProperties(URI source) {

    public BankCodeProperties {
        if (source == null || !"https".equals(source.getScheme()) || source.getHost() == null || source.getHost().isBlank()) {
            throw new IllegalArgumentException("app.donations.bank-codes.source must be an https address, but is " + source);
        }
    }
}

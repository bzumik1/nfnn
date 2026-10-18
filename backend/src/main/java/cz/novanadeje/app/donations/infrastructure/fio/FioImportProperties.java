package cz.novanadeje.app.donations.infrastructure.fio;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.util.StringUtils;

import java.net.URI;
import java.time.Duration;

@ConfigurationProperties("app.donations.fio")
public record FioImportProperties(String token, URI baseUri, Duration interval, Duration initialDelay, Duration requestTimeout) {

    public boolean hasToken() {
        return StringUtils.hasText(token);
    }

    @Override
    public String toString() {
        return "FioImportProperties[token=***, baseUri=" + baseUri + ", interval=" + interval + ", initialDelay=" + initialDelay
                + ", requestTimeout=" + requestTimeout + "]";
    }
}

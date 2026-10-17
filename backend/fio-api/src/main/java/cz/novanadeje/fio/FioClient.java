package cz.novanadeje.fio;

import java.net.URI;
import java.net.http.HttpClient;
import java.time.Clock;
import java.time.Duration;
import java.time.LocalDate;

import static java.util.Objects.requireNonNull;

public interface FioClient {

    URI DEFAULT_BASE_URI = URI.create("https://fioapi.fio.cz/v1/rest");

    Duration MINIMUM_REQUEST_INTERVAL = Duration.ofSeconds(30);

    FioStatement newTransactions();

    FioStatement transactionsBetween(LocalDate from, LocalDate to);

    void setLastDownloadedId(long transactionId);

    void setLastDownloadedDate(LocalDate date);

    static Builder builder(FioToken token) {
        return new Builder(token);
    }

    final class Builder {

        private static final Duration DEFAULT_CONNECT_TIMEOUT = Duration.ofSeconds(10);
        private static final Duration DEFAULT_REQUEST_TIMEOUT = Duration.ofMinutes(2);

        private final FioToken token;
        private URI baseUri = DEFAULT_BASE_URI;
        private HttpClient httpClient;
        private Clock clock = Clock.systemUTC();
        private Duration requestTimeout = DEFAULT_REQUEST_TIMEOUT;

        private Builder(FioToken token) {
            this.token = requireNonNull(token, "token");
        }

        public Builder baseUri(URI baseUri) {
            requireNonNull(baseUri, "baseUri");
            if (!baseUri.isAbsolute()) {
                throw new IllegalArgumentException("The Fio API base URI must be absolute: " + baseUri);
            }
            this.baseUri = baseUri;
            return this;
        }

        public Builder httpClient(HttpClient httpClient) {
            this.httpClient = requireNonNull(httpClient, "httpClient");
            return this;
        }

        public Builder clock(Clock clock) {
            this.clock = requireNonNull(clock, "clock");
            return this;
        }

        public Builder requestTimeout(Duration requestTimeout) {
            requireNonNull(requestTimeout, "requestTimeout");
            if (requestTimeout.isNegative() || requestTimeout.isZero()) {
                throw new IllegalArgumentException("The request timeout must be positive: " + requestTimeout);
            }
            this.requestTimeout = requestTimeout;
            return this;
        }

        public FioClient build() {
            HttpClient client = httpClient != null
                    ? httpClient
                    : HttpClient.newBuilder().connectTimeout(DEFAULT_CONNECT_TIMEOUT).build();
            return new HttpFioClient(token, baseUri, client, clock, requestTimeout);
        }
    }
}

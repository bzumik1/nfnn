package cz.novanadeje.fio;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Clock;
import java.time.Duration;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;

import static java.util.Objects.requireNonNull;

final class HttpFioClient implements FioClient {

    private static final String JSON = "application/json";
    private static final String TRANSACTIONS_JSON = "transactions.json";
    private static final String TRAILING_SLASH = "";

    private final FioToken token;
    private final String baseUri;
    private final HttpClient httpClient;
    private final Clock clock;
    private final Duration requestTimeout;
    private final FioStatementParser parser = new FioStatementParser();

    HttpFioClient(FioToken token, URI baseUri, HttpClient httpClient, Clock clock, Duration requestTimeout) {
        this.token = requireNonNull(token, "token");
        this.baseUri = requireNonNull(baseUri, "baseUri").toString().replaceAll("/+$", "");
        this.httpClient = requireNonNull(httpClient, "httpClient");
        this.clock = requireNonNull(clock, "clock");
        this.requestTimeout = requireNonNull(requestTimeout, "requestTimeout");
    }

    @Override
    public FioStatement newTransactions() {
        return statement(uri("last", token.value(), TRANSACTIONS_JSON));
    }

    @Override
    public FioStatement transactionsBetween(LocalDate from, LocalDate to) {
        requireNonNull(from, "from");
        requireNonNull(to, "to");
        if (to.isBefore(from)) {
            throw new IllegalArgumentException("The period ends on " + to + ", before it starts on " + from);
        }
        return statement(uri("periods", token.value(), iso(from), iso(to), TRANSACTIONS_JSON));
    }

    @Override
    public void setLastDownloadedId(long transactionId) {
        if (transactionId < 0) {
            throw new IllegalArgumentException("A transaction id is never negative: " + transactionId);
        }
        send(request(uri("set-last-id", token.value(), Long.toString(transactionId), TRAILING_SLASH)).build());
    }

    @Override
    public void setLastDownloadedDate(LocalDate date) {
        requireNonNull(date, "date");
        send(request(uri("set-last-date", token.value(), iso(date), TRAILING_SLASH)).build());
    }

    private FioStatement statement(URI uri) {
        HttpRequest request = request(uri).header("Accept", JSON).build();
        HttpResponse<String> response = send(request);
        try {
            return parser.parse(response.body());
        } catch (MalformedStatementException e) {
            throw new FioException(
                    describe(request) + " was answered with HTTP " + response.statusCode()
                            + " and a body that is not an account statement: " + token.mask(e.getMessage()),
                    response.statusCode(),
                    token.mask(response.body()),
                    TokenMaskedFailure.withoutToken(e, token));
        }
    }

    private HttpRequest.Builder request(URI uri) {
        return HttpRequest.newBuilder(uri).timeout(requestTimeout).GET();
    }

    private HttpResponse<String> send(HttpRequest request) {
        HttpResponse<String> response = exchange(request);
        if (response.statusCode() / 100 != 2) {
            throw failure(request, response);
        }
        return response;
    }

    private HttpResponse<String> exchange(HttpRequest request) {
        try {
            return httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        } catch (IOException e) {
            throw new FioTransportException(
                    describe(request) + " failed: " + token.mask(e.toString()),
                    TokenMaskedFailure.withoutToken(e, token));
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new FioTransportException(describe(request) + " was interrupted", TokenMaskedFailure.withoutToken(e, token));
        }
    }

    private FioException failure(HttpRequest request, HttpResponse<String> response) {
        int status = response.statusCode();
        String body = token.mask(response.body());
        String refused = describe(request) + " was refused with HTTP " + status;
        return switch (status) {
            case 409 -> new FioRateLimitException(
                    refused + ": the token was already used less than " + MINIMUM_REQUEST_INTERVAL.toSeconds() + " seconds ago",
                    body,
                    clock.instant().plus(MINIMUM_REQUEST_INTERVAL));
            case 401, 403, 500 -> new FioAuthorizationException(
                    refused + ": the token does not exist, has expired or is not active",
                    status,
                    body);
            case 422 -> new FioHistoryLockedException(
                    refused + ": movements older than 90 days need the full history unlocked in Fio internet banking",
                    body);
            default -> new FioException(refused, status, body);
        };
    }

    private String describe(HttpRequest request) {
        return "Fio API request " + request.method() + " " + token.mask(request.uri().toString());
    }

    private URI uri(String... segments) {
        return URI.create(baseUri + "/" + String.join("/", segments));
    }

    private static String iso(LocalDate date) {
        return DateTimeFormatter.ISO_LOCAL_DATE.format(date);
    }
}

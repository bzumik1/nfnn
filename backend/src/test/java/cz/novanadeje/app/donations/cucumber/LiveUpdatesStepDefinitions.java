package cz.novanadeje.app.donations.cucumber;

import cz.novanadeje.app.cucumber.ApiClient;
import cz.novanadeje.app.shared.application.event.DonorSessionsEnded;
import cz.novanadeje.app.shared.infrastructure.security.JwtProperties;
import io.cucumber.java.After;
import io.cucumber.java.en.Given;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

public class LiveUpdatesStepDefinitions {

    private static final String LIVE = "/api/live";
    private static final String HEALTH = "/actuator/health";
    private static final String REVISION_LINE = "event:revision";
    private static final Duration ANSWER_WITHIN = Duration.ofSeconds(5);

    private final ApiClient api;
    private final JwtEncoder encoder;
    private final JwtProperties jwt;
    private final Clock clock;
    private final ApplicationEventPublisher events;
    private final int port;
    private final HttpClient http = HttpClient.newBuilder()
            .version(HttpClient.Version.HTTP_1_1)
            .connectTimeout(ANSWER_WITHIN)
            .build();
    private final List<UUID> subscribers = new ArrayList<>();
    private final List<InputStream> openStreams = new ArrayList<>();
    private HttpResponse<String> refusal;

    public LiveUpdatesStepDefinitions(ApiClient api, JwtEncoder encoder, JwtProperties jwt, Clock clock,
                                      ApplicationEventPublisher events, @LocalServerPort int port) {
        this.api = api;
        this.encoder = encoder;
        this.jwt = jwt;
        this.clock = clock;
        this.events = events;
        this.port = port;
    }

    @When("someone without a token opens the live stream")
    public void someoneWithoutATokenOpensTheLiveStream() {
        api.forgetCredentials();
        api.get(LIVE);
    }

    @Given("{int} donors each keep {int} live streams open")
    public void donorsEachKeepLiveStreamsOpen(int donors, int streams) throws Exception {
        keepStreamsOpen(donors, streams, List.of());
    }

    @When("{int} administrators each keep {int} live streams open")
    public void administratorsEachKeepLiveStreamsOpen(int administrators, int streams) throws Exception {
        keepStreamsOpen(administrators, streams, List.of("ADMIN"));
    }

    @When("another donor opens a live stream")
    public void anotherDonorOpensALiveStream() throws Exception {
        refusal = openRefused(List.of());
    }

    @When("another administrator opens a live stream")
    public void anotherAdministratorOpensALiveStream() throws Exception {
        refusal = openRefused(List.of("ADMIN"));
    }

    @Then("that live stream is refused with {int} and the problem type ending with {string}")
    public void thatLiveStreamIsRefused(int status, String problemType) {
        assertThat(refusal.statusCode()).isEqualTo(status);
        assertThat(refusal.body()).contains(problemType + "\"");
    }

    @Then("the health endpoint answers while {int} live streams are open")
    public void theHealthEndpointAnswersWhileLiveStreamsAreOpen(int streams) throws Exception {
        assertThat(openStreams).hasSize(streams);
        HttpResponse<String> health = http.send(request(HEALTH).build(), HttpResponse.BodyHandlers.ofString());

        assertThat(health.statusCode()).isEqualTo(200);
        assertThat(health.body()).contains("\"UP\"");
    }

    @After
    public void closeLiveStreams() throws IOException {
        for (InputStream stream : openStreams) {
            stream.close();
        }
        openStreams.clear();
        subscribers.forEach(subscriber -> events.publishEvent(new DonorSessionsEnded(subscriber, clock.instant().plusSeconds(1))));
        subscribers.clear();
    }

    private void keepStreamsOpen(int subscribersCount, int streams, List<String> roles) throws Exception {
        for (int subscriber = 0; subscriber < subscribersCount; subscriber++) {
            UUID id = UUID.randomUUID();
            subscribers.add(id);
            String token = token(id, roles);
            for (int stream = 0; stream < streams; stream++) {
                openStreams.add(openStream(token));
            }
        }
    }

    private InputStream openStream(String token) throws Exception {
        HttpResponse<InputStream> answer = http.send(live(token), HttpResponse.BodyHandlers.ofInputStream());
        assertThat(answer.statusCode()).isEqualTo(200);
        BufferedReader lines = new BufferedReader(new InputStreamReader(answer.body(), StandardCharsets.UTF_8));
        assertThat(lines.readLine()).isEqualTo(REVISION_LINE);
        return answer.body();
    }

    private HttpResponse<String> openRefused(List<String> roles) throws Exception {
        UUID id = UUID.randomUUID();
        subscribers.add(id);
        return http.send(live(token(id, roles)), HttpResponse.BodyHandlers.ofString());
    }

    private HttpRequest live(String token) {
        return request(LIVE)
                .header("Accept", "text/event-stream")
                .header("Authorization", "Bearer " + token)
                .build();
    }

    private HttpRequest.Builder request(String path) {
        return HttpRequest.newBuilder(URI.create("http://localhost:" + port + path)).timeout(ANSWER_WITHIN).GET();
    }

    private String token(UUID subscriber, List<String> roles) {
        JwtClaimsSet claims = JwtClaimsSet.builder()
                .issuer(jwt.issuer())
                .subject(subscriber.toString())
                .audience(List.of(jwt.audience()))
                .issuedAt(clock.instant())
                .expiresAt(clock.instant().plus(jwt.accessTokenTtl()))
                .claim(JwtProperties.ROLES_CLAIM, roles)
                .build();
        return encoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), claims)).getTokenValue();
    }
}

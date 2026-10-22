package cz.novanadeje.app.cucumber;

import io.cucumber.spring.ScenarioScope;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

@Component
@ScenarioScope
public class DonorSessions {

    private static final String LOGIN_PATH = "/api/donors/auth/login";
    private static final Duration SAFETY_MARGIN = Duration.ofMinutes(1);

    private final ApiClient api;
    private final ScenarioDonors scenarioDonors;
    private final Clock clock;
    private final JsonMapper jsonMapper = JsonMapper.builder().build();

    public DonorSessions(ApiClient api, ScenarioDonors scenarioDonors, Clock clock) {
        this.api = api;
        this.scenarioDonors = scenarioDonors;
        this.clock = clock;
    }

    public void actAs(String alias) {
        String accessToken = validAccessTokenOf(alias);
        api.forgetCredentials();
        api.authorize(accessToken);
    }

    public void signInAgain(String alias) {
        ScenarioDonors.Credentials credentials = scenarioDonors.credentialsOf(alias);
        api.forgetCredentials();
        ResponseEntity<String> response = api.post(LOGIN_PATH, Map.of("email", credentials.email(), "password", credentials.password()));
        assertThat(response.getStatusCode().value()).withFailMessage("Signing in again answered %s", response.getBody()).isEqualTo(200);
        String renewed = api.lastResponseJson().get("accessToken").asString();
        scenarioDonors.rememberAccessToken(alias, renewed);
        api.authorize(renewed);
    }

    private String validAccessTokenOf(String alias) {
        String accessToken = scenarioDonors.accessTokenOf(alias);
        if (expiresAt(accessToken).isAfter(clock.instant().plus(SAFETY_MARGIN))) {
            return accessToken;
        }
        signInAgain(alias);
        return scenarioDonors.accessTokenOf(alias);
    }

    private Instant expiresAt(String accessToken) {
        String payload = accessToken.split("\\.")[1];
        JsonNode claims = jsonMapper.readTree(new String(Base64.getUrlDecoder().decode(payload), StandardCharsets.UTF_8));
        return Instant.ofEpochSecond(claims.get("exp").asLong());
    }
}

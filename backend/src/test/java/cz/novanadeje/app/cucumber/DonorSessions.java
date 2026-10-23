package cz.novanadeje.app.cucumber;

import io.cucumber.spring.ScenarioScope;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

@Component
@ScenarioScope
public class DonorSessions {

    private static final String LOGIN_PATH = "/api/donors/auth/login";
    private static final String SECOND_FACTOR_PATH = "/api/donors/auth/login/second-factor";
    private static final String SECOND_FACTOR_REQUIRED = "auth/second-factor-required";
    private static final Duration SAFETY_MARGIN = Duration.ofMinutes(1);

    private final ApiClient api;
    private final ScenarioDonors scenarioDonors;
    private final TotpCodes totpCodes;
    private final Clock clock;
    private final JsonMapper jsonMapper = JsonMapper.builder().build();
    private final Map<String, String> refreshCookies = new HashMap<>();

    public DonorSessions(ApiClient api, ScenarioDonors scenarioDonors, TotpCodes totpCodes, Clock clock) {
        this.api = api;
        this.scenarioDonors = scenarioDonors;
        this.totpCodes = totpCodes;
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
        if (response.getStatusCode().value() == 401 && api.lastResponseJson().get("type").asString().endsWith(SECOND_FACTOR_REQUIRED)) {
            String challenge = api.lastResponseJson().get("challenge").asString();
            String code = totpCodes.freshCode(scenarioDonors.secondFactorSecretOf(alias));
            response = api.post(SECOND_FACTOR_PATH, Map.of("challenge", challenge, "code", code));
        }
        assertThat(response.getStatusCode().value()).withFailMessage("Signing in again answered %s", response.getBody()).isEqualTo(200);
        String renewed = api.lastResponseJson().get("accessToken").asString();
        scenarioDonors.rememberAccessToken(alias, renewed);
        String setCookie = response.getHeaders().getFirst(HttpHeaders.SET_COOKIE);
        if (setCookie != null) {
            refreshCookies.put(alias, setCookie.split(";", 2)[0]);
        }
        api.authorize(renewed);
    }

    public String refreshCookieOf(String alias) {
        String cookie = refreshCookies.get(alias);
        assertThat(cookie).withFailMessage("%s has not signed in through the API in this scenario", alias).isNotNull();
        return cookie;
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

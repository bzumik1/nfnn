package cz.novanadeje.app.donors.cucumber;

import cz.novanadeje.app.cucumber.ApiClient;
import cz.novanadeje.app.cucumber.ProfileRowVersions;
import cz.novanadeje.app.cucumber.DonorSessions;
import cz.novanadeje.app.cucumber.ScenarioDonors;
import cz.novanadeje.app.shared.infrastructure.security.JwtProperties;
import io.cucumber.java.en.Given;
import io.cucumber.java.en.When;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;

import java.util.HashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

public class ErasedDonorTabStepDefinitions {

    private static final String PROFILE_PATH = "/api/donors/me";
    private static final String ADMINISTRATORS_PATH = "/api/admin/donors/administrators";

    private final ApiClient api;
    private final DonorSessions sessions;
    private final ScenarioDonors scenarioDonors;
    private final JwtEncoder encoder;
    private final JwtDecoder decoder;
    private final ProfileRowVersions profileVersions;
    private final Map<String, String> tokensWithoutSession = new HashMap<>();
    private final Map<String, String> profileVersionsReadBefore = new HashMap<>();

    public ErasedDonorTabStepDefinitions(ApiClient api, DonorSessions sessions, ScenarioDonors scenarioDonors, JwtEncoder encoder, JwtDecoder decoder, ProfileRowVersions profileVersions) {
        this.api = api;
        this.sessions = sessions;
        this.scenarioDonors = scenarioDonors;
        this.encoder = encoder;
        this.decoder = decoder;
        this.profileVersions = profileVersions;
    }

    @Given("{string} keeps an access token that names no session")
    public void keepsAnAccessTokenThatNamesNoSession(String alias) {
        sessions.actAs(alias);
        Jwt browserToken = decoder.decode(scenarioDonors.accessTokenOf(alias));
        JwtClaimsSet.Builder claims = JwtClaimsSet.builder();
        browserToken.getClaims().forEach(claims::claim);
        claims.claims(all -> all.remove(JwtProperties.SESSION_CLAIM));
        tokensWithoutSession.put(alias, encoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), claims.build())).getTokenValue());
        profileVersionsReadBefore.put(alias, profileVersions.of(scenarioDonors.idOf(alias)));
    }

    @When("{string} saves the profile with the name {string}")
    public void savesTheProfileWithTheName(String alias, String name) {
        sessions.actAs(alias);
        api.patch(PROFILE_PATH, Map.of("name", name), profileVersions.ifMatchOfSignedIn(api));
    }

    @When("{string} saves the profile with the name {string} with the token that names no session")
    public void savesTheProfileWithTheTokenThatNamesNoSession(String alias, String name) {
        actWithTheTokenThatNamesNoSession(alias);
        api.patch(PROFILE_PATH, Map.of("name", name), ApiClient.ifMatch(profileVersionsReadBefore.get(alias)));
    }

    @When("{string} removes {string} from the administrators with the token that names no session")
    public void removesFromTheAdministratorsWithTheTokenThatNamesNoSession(String alias, String administrator) {
        actWithTheTokenThatNamesNoSession(alias);
        api.delete(ADMINISTRATORS_PATH + "/" + scenarioDonors.idOf(administrator));
    }

    private void actWithTheTokenThatNamesNoSession(String alias) {
        String token = tokensWithoutSession.get(alias);
        assertThat(token).withFailMessage("%s keeps no access token without a session in this scenario", alias).isNotNull();
        api.forgetCredentials();
        api.authorize(token);
    }
}

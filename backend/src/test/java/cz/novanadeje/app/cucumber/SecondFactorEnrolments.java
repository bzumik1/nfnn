package cz.novanadeje.app.cucumber;

import cz.novanadeje.app.support.RecordingMailSender;
import io.cucumber.spring.ScenarioScope;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

@Component
@ScenarioScope
public class SecondFactorEnrolments {

    public static final String SETUP_PATH = "/api/donors/me/second-factor/setup";
    public static final String CONFIRM_PATH = "/api/donors/me/second-factor/confirm";
    public static final String ENABLED_NOTICE_SUBJECT = "Dvoufaktorové ověření vašeho účtu bylo zapnuto – Nová naděje";

    private final ApiClient api;
    private final ScenarioDonors scenarioDonors;
    private final DonorSessions sessions;
    private final TotpCodes totpCodes;
    private final RecordingMailSender mailSender;

    public SecondFactorEnrolments(ApiClient api, ScenarioDonors scenarioDonors, DonorSessions sessions, TotpCodes totpCodes,
                                  RecordingMailSender mailSender) {
        this.api = api;
        this.scenarioDonors = scenarioDonors;
        this.sessions = sessions;
        this.totpCodes = totpCodes;
        this.mailSender = mailSender;
    }

    public void enable(String alias) {
        sessions.actAs(alias);
        ResponseEntity<String> setup = api.post(SETUP_PATH, Map.of("password", scenarioDonors.credentialsOf(alias).password()));
        assertThat(setup.getStatusCode().value()).withFailMessage("Second factor set-up answered %s", setup.getBody()).isEqualTo(200);
        String secret = api.lastResponseJson().get("secret").asString();
        scenarioDonors.rememberSecondFactorSecret(alias, secret);
        ResponseEntity<String> confirmed = api.post(CONFIRM_PATH, Map.of("code", totpCodes.freshCode(secret)));
        assertThat(confirmed.getStatusCode().value()).withFailMessage("Second factor confirmation answered %s", confirmed.getBody()).isEqualTo(200);
        String renewed = api.lastResponseJson().get("accessToken").asString();
        scenarioDonors.rememberAccessToken(alias, renewed);
        api.authorize(renewed);
        forgetEnabledNotice();
    }

    public void forgetEnabledNotice() {
        mailSender.forgetOnceSent(ENABLED_NOTICE_SUBJECT);
    }
}

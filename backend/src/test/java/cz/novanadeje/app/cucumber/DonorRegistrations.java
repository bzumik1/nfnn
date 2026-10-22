package cz.novanadeje.app.cucumber;

import cz.novanadeje.app.support.MailContents;
import cz.novanadeje.app.support.RecordingMailSender;
import io.cucumber.spring.ScenarioScope;
import jakarta.mail.internet.MimeMessage;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

@Component
@ScenarioScope
public class DonorRegistrations {

    public static final String REGISTER_PATH = "/api/donors/auth/register";
    public static final String CONFIRM_PATH = "/api/donors/auth/email-verification/confirm";
    private static final Pattern TOKEN_IN_LINK = Pattern.compile("potvrzeni-emailu#token=([A-Za-z0-9_-]{43})");
    private static final Duration MAIL_WAIT = Duration.ofSeconds(5);

    private final ApiClient api;
    private final RecordingMailSender mailSender;

    public DonorRegistrations(ApiClient api, RecordingMailSender mailSender) {
        this.api = api;
        this.mailSender = mailSender;
    }

    public ResponseEntity<String> register(Map<String, ?> body) {
        api.forgetCredentials();
        return api.post(REGISTER_PATH, body);
    }

    public MimeMessage registerAwaitingEmail(Map<String, ?> body) {
        int sentBefore = mailSender.sent().size();
        ResponseEntity<String> registered = register(body);
        assertThat(registered.getStatusCode().value()).withFailMessage("Registration answered %s", registered.getBody()).isEqualTo(202);
        return awaitEmail(sentBefore);
    }

    public ResponseEntity<String> registerAndConfirm(Map<String, ?> body) {
        ResponseEntity<String> confirmed = confirm(tokenOf(registerAwaitingEmail(body)));
        assertThat(confirmed.getStatusCode().value()).withFailMessage("The e-mail confirmation answered %s", confirmed.getBody()).isEqualTo(200);
        mailSender.clear();
        return confirmed;
    }

    public ResponseEntity<String> confirm(String token) {
        api.forgetCredentials();
        return api.post(CONFIRM_PATH, Map.of("token", token));
    }

    private MimeMessage awaitEmail(int sentBefore) {
        await().atMost(MAIL_WAIT).untilAsserted(() -> assertThat(mailSender.sent()).hasSizeGreaterThan(sentBefore));
        return mailSender.sent().get(sentBefore);
    }

    public static String tokenOf(MimeMessage email) {
        Matcher token = TOKEN_IN_LINK.matcher(MailContents.plainText(email));
        assertThat(token.find()).withFailMessage("No verification link in the e-mail").isTrue();
        return token.group(1);
    }
}

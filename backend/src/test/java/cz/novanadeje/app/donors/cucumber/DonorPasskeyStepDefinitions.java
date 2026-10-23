package cz.novanadeje.app.donors.cucumber;

import cz.novanadeje.app.cucumber.ApiClient;
import cz.novanadeje.app.cucumber.DonorRegistrations;
import cz.novanadeje.app.cucumber.DonorSessions;
import cz.novanadeje.app.cucumber.ScenarioDonors;
import cz.novanadeje.app.cucumber.TotpCodes;
import cz.novanadeje.app.donors.SoftwarePasskey;
import cz.novanadeje.app.shared.domain.VariableSymbol;
import cz.novanadeje.app.support.MailContents;
import cz.novanadeje.app.support.RecordingMailSender;
import io.cucumber.java.en.Given;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;
import jakarta.mail.Message;
import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.simple.JdbcClient;
import tools.jackson.databind.JsonNode;

import java.nio.ByteBuffer;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Arrays;
import java.util.Base64;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

public class DonorPasskeyStepDefinitions {

    private static final String REGISTRATION_OPTIONS_PATH = "/api/donors/me/passkeys/options";
    private static final String PASSKEYS_PATH = "/api/donors/me/passkeys";
    private static final String SIGN_IN_OPTIONS_PATH = "/api/donors/auth/passkey/options";
    private static final String SIGN_IN_PATH = "/api/donors/auth/passkey";
    private static final String ADMIN_DONORS_PATH = "/api/admin/donors/";
    private static final String PROFILE_PATH = "/api/donors/me";
    private static final String PASSWORD_PATH = "/api/donors/me/password";
    private static final String PASSWORD_REMOVAL_PATH = "/api/donors/me/password/remove";
    private static final String EMAIL_CHANGE_PATH = "/api/donors/me/email-change";
    private static final String SECOND_FACTOR_SETUP_PATH = "/api/donors/me/second-factor/setup";
    private static final String SECOND_FACTOR_CONFIRM_PATH = "/api/donors/me/second-factor/confirm";
    private static final String RECOVERY_OPTIONS_PATH = "/api/donors/auth/password-reset/passkey/options";
    private static final String RECOVERY_PATH = "/api/donors/auth/password-reset/passkey";
    private static final Pattern RESET_TOKEN_IN_LINK = Pattern.compile("obnova-hesla#token=([A-Za-z0-9_-]{43})");
    private static final String REGISTERED_ADDRESS_STREET = "Dlouhá 12";
    private static final Duration MAIL_WAIT = Duration.ofSeconds(5);
    private static final SecureRandom RANDOM = new SecureRandom();

    private final ApiClient api;
    private final ScenarioDonors scenarioDonors;
    private final DonorSessions sessions;
    private final RecordingMailSender mailSender;
    private final Clock clock;
    private final DonorRegistrations registrations;
    private final TotpCodes totpCodes;
    private final JdbcClient jdbc;
    private final Map<String, Map<String, CreatedPasskey>> passkeys = new HashMap<>();
    private final Map<String, String> registrationChallenges = new HashMap<>();
    private JsonNode creationOptions;
    private String creationOptionsAlias;
    private String signInChallenge;
    private String recoveryChallenge;

    public DonorPasskeyStepDefinitions(ApiClient api, ScenarioDonors scenarioDonors, DonorSessions sessions, RecordingMailSender mailSender,
                                       Clock clock, DonorRegistrations registrations, TotpCodes totpCodes, JdbcClient jdbc) {
        this.api = api;
        this.scenarioDonors = scenarioDonors;
        this.sessions = sessions;
        this.mailSender = mailSender;
        this.clock = clock;
        this.registrations = registrations;
        this.totpCodes = totpCodes;
        this.jdbc = jdbc;
    }

    @Given("a person {string} is registered without a password")
    public void aPersonIsRegisteredWithoutAPassword(String alias) {
        String email = alias.toLowerCase(Locale.ROOT) + "@example.cz";
        Map<String, Object> body = new HashMap<>();
        body.put("type", "PERSON");
        body.put("name", alias + " Nováková");
        body.put("companyIdentifier", null);
        body.put("address", Map.of("street", REGISTERED_ADDRESS_STREET, "city", "Ústí nad Labem", "postalCode", "400 01"));
        body.put("email", email);
        body.put("password", null);
        registrations.registerAndConfirm(body);
        JsonNode user = api.lastResponseJson().get("user");
        scenarioDonors.remember(alias, UUID.fromString(user.get("id").asString()),
                new VariableSymbol(user.get("variableSymbol").asString()));
        scenarioDonors.rememberAccessToken(alias, api.lastResponseJson().get("accessToken").asString());
        scenarioDonors.rememberCredentials(alias, email, null);
    }

    @Then("the donor profile of {string} says the account has no password")
    public void theDonorProfileSaysTheAccountHasNoPassword(String alias) {
        assertThat(profileOf(alias).get("hasPassword").asBoolean()).isFalse();
    }

    @Then("the donor profile of {string} says the account has a password")
    public void theDonorProfileSaysTheAccountHasAPassword(String alias) {
        assertThat(profileOf(alias).get("hasPassword").asBoolean()).isTrue();
    }

    @When("{string} asks to add a passkey without confirming it")
    public void asksToAddAPasskeyWithoutConfirmingIt(String alias) {
        asksToAddAPasskeyWith(alias, Map.of());
    }

    @When("{string} asks to add a passkey confirmed with the passkey {string}")
    public void asksToAddAPasskeyConfirmedWithThePasskey(String alias, String name) {
        asksToAddAPasskeyWith(alias, Map.of("passkey", passkeyConfirmation(alias, name)));
    }

    @When("{string} asks to add a passkey confirmed with the passkey {string} of {string}")
    public void asksToAddAPasskeyConfirmedWithThePasskeyOf(String alias, String name, String owner) {
        asksToAddAPasskeyWith(alias, Map.of("passkey", passkeyConfirmation(owner, name)));
    }

    @When("{string} asks to add a passkey confirmed with the passkey {string} answering a spent challenge")
    public void asksToAddAPasskeyConfirmedAnsweringASpentChallenge(String alias, String name) {
        Map<String, Object> confirmation = passkeyConfirmation(alias, name);
        api.post(SIGN_IN_PATH, confirmation);
        assertThat(api.lastResponse().getStatusCode().value()).withFailMessage("Sign-in answered %s", api.lastResponse().getBody()).isEqualTo(200);
        asksToAddAPasskeyWith(alias, Map.of("passkey", confirmation));
    }

    @When("{string} starts the second factor set-up confirmed with the passkey {string}")
    public void startsTheSecondFactorSetUpConfirmedWithThePasskey(String alias, String name) {
        Map<String, Object> confirmation = passkeyConfirmation(alias, name);
        sessions.actAs(alias);
        api.post(SECOND_FACTOR_SETUP_PATH, Map.of("passkey", confirmation));
    }

    @Given("{string} turned the second factor on confirmed with the passkey {string}")
    public void turnedTheSecondFactorOnConfirmedWithThePasskey(String alias, String name) {
        startsTheSecondFactorSetUpConfirmedWithThePasskey(alias, name);
        assertThat(api.lastResponse().getStatusCode().value()).withFailMessage("Set-up answered %s", api.lastResponse().getBody()).isEqualTo(200);
        String secret = api.lastResponseJson().get("secret").asString();
        scenarioDonors.rememberSecondFactorSecret(alias, secret);
        ResponseEntity<String> confirmed = api.post(SECOND_FACTOR_CONFIRM_PATH, Map.of("code", totpCodes.freshCode(secret)));
        assertThat(confirmed.getStatusCode().value()).withFailMessage("Confirmation answered %s", confirmed.getBody()).isEqualTo(200);
        scenarioDonors.rememberAccessToken(alias, api.lastResponseJson().get("accessToken").asString());
    }

    @When("{string} asks to change the e-mail to {string} confirmed with the passkey {string}")
    public void asksToChangeTheEmailConfirmedWithThePasskey(String alias, String newEmail, String name) {
        Map<String, Object> confirmation = passkeyConfirmation(alias, name);
        sessions.actAs(alias);
        api.post(EMAIL_CHANGE_PATH, Map.of("newEmail", newEmail, "passkey", confirmation));
    }

    @When("{string} sets the password {string} confirmed with the passkey {string}")
    public void setsThePasswordConfirmedWithThePasskey(String alias, String password, String name) {
        Map<String, Object> confirmation = passkeyConfirmation(alias, name);
        sessions.actAs(alias);
        ResponseEntity<String> response = api.put(PASSWORD_PATH, Map.of("newPassword", password, "passkey", confirmation));
        if (response.getStatusCode().value() == 200) {
            adoptSession(alias);
            scenarioDonors.rememberCredentials(alias, scenarioDonors.credentialsOf(alias).email(), password);
        }
    }

    @When("{string} removes the password")
    public void removesThePassword(String alias) {
        Map<String, Object> confirmation = confirmationOf(alias);
        sessions.actAs(alias);
        ResponseEntity<String> response = api.post(PASSWORD_REMOVAL_PATH, confirmation);
        if (response.getStatusCode().value() == 200) {
            adoptSession(alias);
            scenarioDonors.rememberCredentials(alias, scenarioDonors.credentialsOf(alias).email(), null);
        }
    }

    @When("{string} asks for a new passkey with the link from the e-mail")
    public void asksForANewPasskeyWithTheLink(String alias) {
        asksForANewPasskey(Map.of("token", resetToken()));
    }

    @When("{string} asks for a new passkey with the link from the e-mail and code {string}")
    public void asksForANewPasskeyWithTheLinkAndCode(String alias, String code) {
        asksForANewPasskey(Map.of("token", resetToken(), "code", code));
    }

    @When("{string} asks for a new passkey with the link from the e-mail and the current code")
    public void asksForANewPasskeyWithTheLinkAndTheCurrentCode(String alias) {
        asksForANewPasskey(Map.of("token", resetToken(), "code", totpCodes.freshCode(scenarioDonors.secondFactorSecretOf(alias))));
    }

    @When("{string} adds the new passkey named {string} with the link from the e-mail")
    public void addsTheNewPasskeyWithTheLink(String alias, String name) {
        SoftwarePasskey key = SoftwarePasskey.forUser(scenarioDonors.idOf(alias));
        String challenge = recoveryChallenge == null ? randomChallenge() : recoveryChallenge;
        api.forgetCredentials();
        ResponseEntity<String> response = api.post(RECOVERY_PATH,
                Map.of("token", resetToken(), "challenge", challenge, "name", name, "credential", key.registration(challenge)));
        if (response.getStatusCode().value() == 201) {
            passkeys.computeIfAbsent(alias, ignored -> new LinkedHashMap<>())
                    .put(name, new CreatedPasskey(key, api.lastResponseJson().get("id").asString()));
        }
    }

    @Then("no session of {string} is live any more")
    public void noSessionIsLiveAnyMore(String alias) {
        Integer live = jdbc.sql("select count(*) from donor_refresh_token where donor_id = ? and revoked_at is null and used_at is null")
                .param(scenarioDonors.idOf(alias))
                .query(Integer.class)
                .single();
        assertThat(live).isZero();
    }

    @When("{string} asks to add a passkey with the right password")
    public void asksToAddAPasskeyWithTheRightPassword(String alias) {
        asksToAddAPasskeyWithPassword(alias, scenarioDonors.credentialsOf(alias).password());
    }

    @When("{string} asks to add a passkey with password {string}")
    public void asksToAddAPasskeyWithPassword(String alias, String password) {
        asksToAddAPasskeyWith(alias, Map.of("password", password));
    }

    private void asksToAddAPasskeyWith(String alias, Map<String, ?> confirmation) {
        sessions.actAs(alias);
        ResponseEntity<String> response = api.post(REGISTRATION_OPTIONS_PATH, confirmation);
        if (response.getStatusCode().value() == 200) {
            creationOptions = api.lastResponseJson();
            creationOptionsAlias = alias;
            registrationChallenges.put(alias, creationOptions.get("challenge").asString());
        }
    }

    @Given("{string} asked to add a passkey with the right password {int} times")
    public void askedToAddAPasskeyTimes(String alias, int times) {
        for (int i = 0; i < times; i++) {
            asksToAddAPasskeyWithTheRightPassword(alias);
            assertThat(api.lastResponse().getStatusCode().value()).withFailMessage("Options answered %s", api.lastResponse().getBody()).isEqualTo(200);
        }
    }

    @Then("the passkey creation options name the site {string} called {string} and the account of {string}")
    public void theCreationOptionsNameTheSiteAndTheAccount(String rpId, String rpName, String alias) {
        assertThat(creationOptions.get("rp").get("id").asString()).isEqualTo(rpId);
        assertThat(creationOptions.get("rp").get("name").asString()).isEqualTo(rpName);
        JsonNode user = creationOptions.get("user");
        assertThat(user.get("id").asString()).isEqualTo(base64Url(uuidBytes(scenarioDonors.idOf(alias))));
        assertThat(user.get("name").asString()).isEqualTo(scenarioDonors.credentialsOf(alias).email());
        assertThat(user.get("displayName").asString()).isNotBlank();
        assertThat(creationOptions.get("challenge").asString()).hasSize(43);
        assertThat(creationOptions.get("timeout").asLong()).isEqualTo(300_000L);
        assertThat(creationOptions.get("pubKeyCredParams").valueStream().map(parameter -> parameter.get("alg").asInt()).toList())
                .containsExactly(-7, -8, -257);
    }

    @Then("the passkey creation options ask for a discoverable passkey with user verification and no attestation")
    public void theCreationOptionsAskForADiscoverablePasskey() {
        JsonNode selection = creationOptions.get("authenticatorSelection");
        assertThat(selection.get("residentKey").asString()).isEqualTo("required");
        assertThat(selection.get("requireResidentKey").asBoolean()).isTrue();
        assertThat(selection.get("userVerification").asString()).isEqualTo("required");
        assertThat(creationOptions.get("attestation").asString()).isEqualTo("none");
        assertThat(creationOptions.get("excludeCredentials").isEmpty()).isTrue();
    }

    @Then("the passkey creation options exclude the passkey {string}")
    public void theCreationOptionsExcludeThePasskey(String name) {
        String credentialId = passkey(creationOptionsAlias, name).key().credentialId();
        assertThat(creationOptions.get("excludeCredentials").valueStream().map(descriptor -> descriptor.get("id").asString()).toList())
                .containsExactly(credentialId);
        assertThat(creationOptions.get("excludeCredentials").get(0).get("transports").valueStream().map(JsonNode::asString).toList())
                .containsExactly("internal", "hybrid");
    }

    @When("{string} adds a passkey named {string}")
    public void addsAPasskeyNamed(String alias, String name) {
        SoftwarePasskey key = SoftwarePasskey.forUser(scenarioDonors.idOf(alias));
        register(alias, name, key, challenge -> key.registration(challenge));
    }

    @Given("{string} added a passkey named {string}")
    public void addedAPasskeyNamed(String alias, String name) {
        int mailsBefore = mailSender.sent().size();
        addsAPasskeyNamed(alias, name);
        assertThat(api.lastResponse().getStatusCode().value()).withFailMessage("Adding a passkey answered %s", api.lastResponse().getBody()).isEqualTo(201);
        await().atMost(MAIL_WAIT).untilAsserted(() -> assertThat(mailSender.sent()).hasSize(mailsBefore + 1));
    }

    @Given("{string} added {int} passkeys")
    public void addedPasskeys(String alias, int count) {
        for (int i = 1; i <= count; i++) {
            addedAPasskeyNamed(alias, "Klíč " + i);
        }
        api.comeFromAnotherAddress();
    }

    @When("{string} adds a passkey named {string} created for the site {string}")
    public void addsAPasskeyCreatedForTheSite(String alias, String name, String origin) {
        SoftwarePasskey key = SoftwarePasskey.forUser(scenarioDonors.idOf(alias));
        register(alias, name, key, challenge -> key.registration(challenge, origin, true));
    }

    @When("{string} adds a passkey named {string} without user verification")
    public void addsAPasskeyWithoutUserVerification(String alias, String name) {
        SoftwarePasskey key = SoftwarePasskey.forUser(scenarioDonors.idOf(alias));
        register(alias, name, key, challenge -> key.registration(challenge, SoftwarePasskey.SITE, false));
    }

    @When("{string} adds a passkey named {string} answering a challenge the site never issued")
    public void addsAPasskeyAnsweringAChallengeNeverIssued(String alias, String name) {
        SoftwarePasskey key = SoftwarePasskey.forUser(scenarioDonors.idOf(alias));
        String invented = randomChallenge();
        sessions.actAs(alias);
        api.post(PASSKEYS_PATH, Map.of("challenge", invented, "name", name, "credential", key.registration(invented)));
    }

    @When("{string} adds a passkey named {string} answering the challenge issued to {string}")
    public void addsAPasskeyAnsweringTheChallengeIssuedTo(String alias, String name, String owner) {
        asksToAddAPasskeyWithTheRightPassword(owner);
        String foreign = registrationChallenges.get(owner);
        SoftwarePasskey key = SoftwarePasskey.forUser(scenarioDonors.idOf(alias));
        sessions.actAs(alias);
        api.post(PASSKEYS_PATH, Map.of("challenge", foreign, "name", name, "credential", key.registration(foreign)));
    }

    @Then("the passkeys of {string} are none")
    public void thePasskeysAreNone(String alias) {
        assertThat(passkeyNames(alias)).isEmpty();
    }

    @Then("the passkeys of {string} are {string}")
    public void thePasskeysAre(String alias, String names) {
        assertThat(passkeyNames(alias)).isEqualTo(Arrays.asList(names.split(", ")));
    }

    @Then("the passkey {string} of {string} was last used now")
    public void thePasskeyWasLastUsedNow(String name, String alias) {
        JsonNode item = listed(alias).stream().filter(candidate -> candidate.get("name").asString().equals(name)).findFirst().orElseThrow();
        assertThat(Instant.parse(item.get("lastUsedAt").asString())).isEqualTo(clock.instant());
        assertThat(Instant.parse(item.get("createdAt").asString())).isBefore(clock.instant());
    }

    @When("{string} removes the passkey {string} of {string}")
    public void removesThePasskeyOf(String alias, String name, String owner) {
        String id = passkey(owner, name).id();
        sessions.actAs(alias);
        api.delete(PASSKEYS_PATH + "/" + id);
    }

    @When("someone without a token asks for the passkeys")
    public void someoneWithoutATokenAsksForThePasskeys() {
        api.forgetCredentials();
        api.get(PASSKEYS_PATH);
    }

    @When("{string} removes the passkeys of {string}")
    public void removesThePasskeysOfTheDonor(String alias, String owner) {
        sessions.actAs(alias);
        api.delete(ADMIN_DONORS_PATH + scenarioDonors.idOf(owner) + "/passkeys");
    }

    @When("the browser asks for a passkey sign-in")
    public void theBrowserAsksForAPasskeySignIn() {
        api.forgetCredentials();
        ResponseEntity<String> response = api.post(SIGN_IN_OPTIONS_PATH, Map.of());
        if (response.getStatusCode().value() == 200) {
            JsonNode options = api.lastResponseJson();
            assertThat(options.get("rpId").asString()).isEqualTo(SoftwarePasskey.RP_ID);
            assertThat(options.get("userVerification").asString()).isEqualTo("required");
            assertThat(options.get("allowCredentials").isEmpty()).isTrue();
            signInChallenge = options.get("challenge").asString();
        }
    }

    @Given("the browser asked for a passkey sign-in")
    public void theBrowserAskedForAPasskeySignIn() {
        theBrowserAsksForAPasskeySignIn();
        assertThat(api.lastResponse().getStatusCode().value()).withFailMessage("Sign-in options answered %s", api.lastResponse().getBody()).isEqualTo(200);
    }

    @Given("the browser asked for a passkey sign-in {int} times")
    public void theBrowserAskedForAPasskeySignInTimes(int times) {
        for (int i = 0; i < times; i++) {
            theBrowserAskedForAPasskeySignIn();
        }
    }

    @When("{string} signs in with the passkey {string}")
    public void signsInWithThePasskey(String alias, String name) {
        theBrowserAskedForAPasskeySignIn();
        answer(passkey(alias, name).key().assertion(signInChallenge), alias);
    }

    @When("{string} answers the sign-in with the passkey {string}")
    public void answersTheSignInWithThePasskey(String alias, String name) {
        answer(passkey(alias, name).key().assertion(signInChallenge), alias);
    }

    @When("{string} signs in with the passkey {string} without user verification")
    public void signsInWithThePasskeyWithoutUserVerification(String alias, String name) {
        theBrowserAskedForAPasskeySignIn();
        answer(passkey(alias, name).key().assertion(signInChallenge, false), alias);
    }

    @When("someone signs in with a passkey the site does not know")
    public void someoneSignsInWithAnUnknownPasskey() {
        theBrowserAskedForAPasskeySignIn();
        answer(SoftwarePasskey.forUser(UUID.randomUUID()).assertion(signInChallenge), null);
    }

    @When("someone signs in with the passkey {string} of {string} signed by another device")
    public void someoneSignsInWithThePasskeySignedByAnotherDevice(String name, String alias) {
        theBrowserAskedForAPasskeySignIn();
        answer(passkey(alias, name).key().withAnotherKey().assertion(signInChallenge), null);
    }

    @Then("an e-mail goes to the address of {string} with the subject {string}")
    public void anEmailGoesToTheAddressOfWithTheSubject(String alias, String subject) {
        String recipient = scenarioDonors.credentialsOf(alias).email();
        await().atMost(MAIL_WAIT).untilAsserted(() -> assertThat(mailSender.sent())
                .anySatisfy(sent -> {
                    assertThat(recipients(sent)).containsExactly(recipient);
                    assertThat(sent.getSubject()).isEqualTo(subject);
                }));
    }

    private void register(String alias, String name, SoftwarePasskey key, Function<String, Map<String, Object>> credential) {
        asksToAddAPasskeyWith(alias, confirmationOf(alias));
        if (api.lastResponse().getStatusCode().value() != 200) {
            return;
        }
        String challenge = registrationChallenges.get(alias);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("challenge", challenge);
        body.put("name", name);
        body.put("credential", credential.apply(challenge));
        ResponseEntity<String> response = api.post(PASSKEYS_PATH, body);
        if (response.getStatusCode().value() == 201) {
            JsonNode created = api.lastResponseJson();
            assertThat(created.get("name").asString()).isEqualTo(name);
            passkeys.computeIfAbsent(alias, ignored -> new LinkedHashMap<>()).put(name, new CreatedPasskey(key, created.get("id").asString()));
        }
    }

    private void answer(Map<String, Object> credential, String alias) {
        api.forgetCredentials();
        ResponseEntity<String> response = api.post(SIGN_IN_PATH, Map.of("challenge", signInChallenge, "credential", credential));
        if (response.getStatusCode().is2xxSuccessful()) {
            String accessToken = api.lastResponseJson().get("accessToken").asString();
            if (alias != null) {
                scenarioDonors.rememberAccessToken(alias, accessToken);
            }
            api.authorize(accessToken);
        }
    }

    private Map<String, Object> confirmationOf(String alias) {
        String password = scenarioDonors.credentialsOf(alias).password();
        if (password != null) {
            return Map.of("password", password);
        }
        Map<String, CreatedPasskey> keys = passkeys.getOrDefault(alias, Map.of());
        if (keys.isEmpty()) {
            return Map.of();
        }
        return Map.of("passkey", passkeyConfirmation(alias, keys.keySet().iterator().next()));
    }

    private Map<String, Object> passkeyConfirmation(String alias, String name) {
        ResponseEntity<String> response = api.post(SIGN_IN_OPTIONS_PATH, Map.of());
        assertThat(response.getStatusCode().value()).withFailMessage("Sign-in options answered %s", response.getBody()).isEqualTo(200);
        String challenge = api.lastResponseJson().get("challenge").asString();
        return Map.of("challenge", challenge, "credential", passkey(alias, name).key().assertion(challenge));
    }

    private void asksForANewPasskey(Map<String, ?> body) {
        api.forgetCredentials();
        ResponseEntity<String> response = api.post(RECOVERY_OPTIONS_PATH, body);
        if (response.getStatusCode().value() == 200) {
            recoveryChallenge = api.lastResponseJson().get("challenge").asString();
        }
    }

    private String resetToken() {
        await().atMost(MAIL_WAIT).untilAsserted(() -> assertThat(mailSender.sent()).isNotEmpty());
        return mailSender.sent().reversed().stream()
                .map(mail -> RESET_TOKEN_IN_LINK.matcher(MailContents.plainText(mail)))
                .filter(Matcher::find)
                .map(token -> token.group(1))
                .findFirst()
                .orElseThrow(() -> new AssertionError("No e-mail carries a reset link"));
    }

    private JsonNode profileOf(String alias) {
        sessions.actAs(alias);
        ResponseEntity<String> response = api.get(PROFILE_PATH);
        assertThat(response.getStatusCode().value()).withFailMessage("Profile answered %s", response.getBody()).isEqualTo(200);
        return api.lastResponseJson();
    }

    private void adoptSession(String alias) {
        String accessToken = api.lastResponseJson().get("accessToken").asString();
        scenarioDonors.rememberAccessToken(alias, accessToken);
        api.authorize(accessToken);
    }

    private List<String> passkeyNames(String alias) {
        return listed(alias).stream().map(item -> item.get("name").asString()).toList();
    }

    private List<JsonNode> listed(String alias) {
        sessions.actAs(alias);
        ResponseEntity<String> response = api.get(PASSKEYS_PATH);
        assertThat(response.getStatusCode().value()).withFailMessage("Passkeys answered %s", response.getBody()).isEqualTo(200);
        return api.lastResponseJson().get("items").valueStream().toList();
    }

    private CreatedPasskey passkey(String alias, String name) {
        CreatedPasskey found = passkeys.getOrDefault(alias, Map.of()).get(name);
        assertThat(found).withFailMessage("%s has no passkey named %s in this scenario", alias, name).isNotNull();
        return found;
    }

    private static List<String> recipients(MimeMessage message) throws MessagingException {
        return Arrays.stream(message.getRecipients(Message.RecipientType.TO)).map(Object::toString).toList();
    }

    private static String randomChallenge() {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        return base64Url(bytes);
    }

    private static byte[] uuidBytes(UUID id) {
        return ByteBuffer.allocate(16).putLong(id.getMostSignificantBits()).putLong(id.getLeastSignificantBits()).array();
    }

    private static String base64Url(byte[] bytes) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private record CreatedPasskey(SoftwarePasskey key, String id) {
    }
}

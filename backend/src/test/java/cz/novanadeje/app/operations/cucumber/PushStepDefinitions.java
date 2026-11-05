package cz.novanadeje.app.operations.cucumber;

import cz.novanadeje.app.cucumber.ApiClient;
import cz.novanadeje.app.cucumber.DonorSessions;
import cz.novanadeje.app.cucumber.ScenarioDonors;
import cz.novanadeje.app.operations.infrastructure.push.PushReceiver;
import cz.novanadeje.app.shared.infrastructure.config.PublicUrlProperties;
import cz.novanadeje.app.support.RecordingPushTransport;
import io.cucumber.datatable.DataTable;
import io.cucumber.java.en.Given;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import tools.jackson.databind.JsonNode;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Consumer;

import static org.assertj.core.api.Assertions.assertThat;

public class PushStepDefinitions {

    private static final String PUSH = "/api/admin/operations/push";
    private static final String SUBSCRIPTIONS = PUSH + "/subscriptions";
    private static final String SESSION_CLAIM = "sid";
    private static final String PUBLIC_KEY_SHAPE = "B[A-Za-z0-9_-]{86}";
    private static final long VAPID_LIFETIME_SECONDS = 3600;
    private static final int CREATED = 201;

    private final ApiClient api;
    private final DonorSessions sessions;
    private final ScenarioDonors donors;
    private final RecordingPushTransport pushService;
    private final JwtEncoder encoder;
    private final JwtDecoder decoder;
    private final JdbcClient jdbc;
    private final PublicUrlProperties site;
    private final Clock clock;
    private final Map<String, Device> devices = new HashMap<>();
    private String publicKey;

    public PushStepDefinitions(ApiClient api, DonorSessions sessions, ScenarioDonors donors, RecordingPushTransport pushService, JwtEncoder encoder,
                               JwtDecoder decoder, JdbcClient jdbc, PublicUrlProperties site, Clock clock) {
        this.api = api;
        this.sessions = sessions;
        this.donors = donors;
        this.pushService = pushService;
        this.encoder = encoder;
        this.decoder = decoder;
        this.jdbc = jdbc;
        this.site = site;
        this.clock = clock;
    }

    @When("{string} asks for the push settings")
    public void asksForThePushSettings(String alias) {
        sessions.actAs(alias);
        api.get(PUSH);
    }

    @When("someone without a token asks for the push settings")
    public void someoneWithoutATokenAsksForThePushSettings() {
        api.forgetCredentials();
        api.get(PUSH);
    }

    @When("{string} turns push alerts on for the device {string} at {string}")
    public void turnsPushAlertsOnForTheDeviceAt(String alias, String device, String endpoint) {
        PushReceiver receiver = PushReceiver.generate();
        subscribe(alias, device, endpoint, receiver, receiver.p256dh());
    }

    @When("{string} turns push alerts on for the device {string} at {string} with a browser key that is no point on the curve")
    public void turnsPushAlertsOnWithAnOffCurveKey(String alias, String device, String endpoint) {
        PushReceiver receiver = PushReceiver.generate();
        byte[] point = Base64.getUrlDecoder().decode(receiver.p256dh());
        point[point.length - 1] ^= 0x01;
        subscribe(alias, device, endpoint, receiver, Base64.getUrlEncoder().withoutPadding().encodeToString(point));
    }

    @Given("{string} turned push alerts on for the device {string} at {string}")
    public void turnedPushAlertsOnForTheDeviceAt(String alias, String device, String endpoint) {
        turnsPushAlertsOnForTheDeviceAt(alias, device, endpoint);
        assertThat(api.lastResponse().getStatusCode().value()).withFailMessage("Subscribing answered %s", api.lastResponse().getBody()).isEqualTo(CREATED);
    }

    @Given("{string} turned push alerts on for {int} devices")
    public void turnedPushAlertsOnForDevices(String alias, int count) {
        for (int index = 1; index <= count; index++) {
            turnedPushAlertsOnForTheDeviceAt(alias, "zařízení " + index, "https://fcm.googleapis.com/fcm/send/" + alias.toLowerCase() + "-" + index);
        }
    }

    @When("{string} turns push alerts on in a browser session that names no device")
    public void turnsPushAlertsOnInASessionThatNamesNoDevice(String alias) {
        actWithoutDevice(alias);
        PushReceiver receiver = PushReceiver.generate();
        api.post(SUBSCRIPTIONS, body("https://fcm.googleapis.com/fcm/send/" + alias.toLowerCase() + "-bez-zarizeni", receiver.p256dh(), receiver.auth()));
    }

    @When("{string} sends a test push alert")
    public void sendsATestPushAlert(String alias) {
        sessions.actAs(alias);
        api.post(PUSH + "/test", Map.of());
    }

    @Given("{string} sent {int} test push alerts")
    public void sentTestPushAlerts(String alias, int count) {
        for (int index = 0; index < count; index++) {
            sendsATestPushAlert(alias);
            assertThat(api.lastResponse().getStatusCode().value()).withFailMessage("The test answered %s", api.lastResponse().getBody()).isEqualTo(200);
        }
    }

    @Given("the push service answers {int} for {string}")
    public void thePushServiceAnswersFor(int status, String endpoint) {
        pushService.answer(URI.create(endpoint), status);
    }

    @When("{string} changes the push alerts of the device {string} to bank import {word}, backups {word} and mail {word}")
    public void changesThePushAlertsOfTheDevice(String alias, String device, String bankImport, String backups, String mail) {
        changesThePushAlertsOfOnTheDevice(alias, alias, device, bankImport, backups, mail);
    }

    @When("{string} changes the push alerts of {string} on the device {string} to bank import {word}, backups {word} and mail {word}")
    public void changesThePushAlertsOfOnTheDevice(String alias, String owner, String device, String bankImport, String backups, String mail) {
        sessions.actAs(alias);
        api.put(SUBSCRIPTIONS + "/" + device(owner, device).subscriptionId() + "/alerts",
                Map.of("bankImport", on(bankImport), "backups", on(backups), "mail", on(mail)));
    }

    @When("{string} turns push alerts off for the device {string}")
    public void turnsPushAlertsOffForTheDevice(String alias, String device) {
        turnsPushAlertsOffForOnTheDevice(alias, alias, device);
    }

    @When("{string} turns push alerts off for {string} on the device {string}")
    public void turnsPushAlertsOffForOnTheDevice(String alias, String owner, String device) {
        sessions.actAs(alias);
        api.delete(SUBSCRIPTIONS + "/" + device(owner, device).subscriptionId());
    }

    @Then("the push settings carry the server's public key")
    public void thePushSettingsCarryTheServersPublicKey() {
        String key = api.lastResponseJson().get("publicKey").asString();
        assertThat(key).matches(PUBLIC_KEY_SHAPE);
        publicKey = key;
    }

    @Then("the push settings carry the same public key as before")
    public void thePushSettingsCarryTheSamePublicKeyAsBefore() {
        assertThat(publicKey).as("a public key read earlier in the scenario").isNotNull();
        assertThat(api.lastResponseJson().get("publicKey").asString()).isEqualTo(publicKey);
    }

    @Then("the push settings list the devices:")
    public void thePushSettingsListTheDevices(DataTable table) {
        List<Map<String, String>> actual = new ArrayList<>();
        List<Map<String, String>> expected = table.asMaps();
        api.lastResponseJson().get("subscriptions").forEach(subscription -> {
            Map<String, String> row = new LinkedHashMap<>();
            for (String column : expected.getFirst().keySet()) {
                row.put(column, switch (column) {
                    case "service", "failuresInARow" -> subscription.get(column).asString();
                    case "bankImport", "backups", "mail" -> onOff(subscription.get("alerts").get(column).asBoolean());
                    case "delivered" -> subscription.get("lastDeliveredAt").isNull() ? "never" : "yes";
                    default -> throw new IllegalArgumentException("Unknown column " + column);
                });
            }
            actual.add(row);
        });
        assertThat(actual).containsExactlyElementsOf(expected);
    }

    @Then("the push settings list no device")
    public void thePushSettingsListNoDevice() {
        assertThat(api.lastResponseJson().get("subscriptions").isEmpty()).isTrue();
    }

    @Then("the push subscription says service {string} with bank import {word}, backups {word} and mail {word}")
    public void thePushSubscriptionSays(String service, String bankImport, String backups, String mail) {
        JsonNode subscription = api.lastResponseJson();
        assertThat(subscription.get("service").asString()).isEqualTo(service);
        assertThat(onOff(subscription.get("alerts").get("bankImport").asBoolean())).isEqualTo(bankImport);
        assertThat(onOff(subscription.get("alerts").get("backups").asBoolean())).isEqualTo(backups);
        assertThat(onOff(subscription.get("alerts").get("mail").asBoolean())).isEqualTo(mail);
        assertThat(subscription.has("endpoint")).isFalse();
        assertThat(subscription.has("keys")).isFalse();
    }

    @Then("the test push alert reached {int}, failed for {int} and removed {int} devices")
    public void theTestPushAlertReached(int delivered, int failed, int removed) {
        JsonNode report = api.lastResponseJson();
        assertThat(report.get("delivered").asInt()).as("delivered").isEqualTo(delivered);
        assertThat(report.get("failed").asInt()).as("failed").isEqualTo(failed);
        assertThat(report.get("removed").asInt()).as("removed").isEqualTo(removed);
    }

    @Then("the device {string} of {string} received the push alert:")
    public void theDeviceReceivedThePushAlert(String device, String alias, String plaintext) {
        Device known = device(alias, device);
        List<RecordingPushTransport.Sent> sent = pushService.sent().stream().filter(message -> message.endpoint().equals(known.endpoint())).toList();
        assertThat(sent).as("messages to the device %s", device).hasSize(1);
        RecordingPushTransport.Sent message = sent.getFirst();
        assertThat(known.receiver().decrypt(message.body())).isEqualTo(plaintext);
        assertThat(message.headers()).containsEntry("Content-Encoding", "aes128gcm").containsEntry("TTL", "86400")
                .containsEntry("Urgency", "high").doesNotContainKey("Topic");
        PushReceiver.VapidClaims claims = PushReceiver.verifiedVapid(message.headers().get("Authorization"));
        assertThat(claims.publicKey()).isEqualTo(publicKey);
        assertThat(claims.audience()).isEqualTo("https://" + known.endpoint().getHost());
        assertThat(claims.subject()).isEqualTo(site.publicUrl());
        assertThat(claims.expiresAtEpochSecond()).isEqualTo(clock.instant().getEpochSecond() + VAPID_LIFETIME_SECONDS);
    }

    @Then("{int} push alerts were sent")
    public void pushAlertsWereSent(int count) {
        assertThat(pushService.sent()).hasSize(count);
    }

    @Then("no push alert was sent")
    public void noPushAlertWasSent() {
        assertThat(pushService.sent()).isEmpty();
    }

    @Then("no push subscription of {string} is stored")
    public void noPushSubscriptionOfIsStored(String alias) {
        assertThat(jdbc.sql("select count(*) from operations_push_subscription where administrator_id = ?").param(donors.idOf(alias))
                .query(Long.class).single()).isZero();
    }

    @Then("{int} push subscription(s) of {string} is/are stored")
    public void pushSubscriptionsOfAreStored(int count, String alias) {
        assertThat(jdbc.sql("select count(*) from operations_push_subscription where administrator_id = ?").param(donors.idOf(alias))
                .query(Long.class).single()).isEqualTo(count);
    }

    @Then("the admin action {string} by {string} on a push subscription is recorded with details {string}")
    public void theAdminActionOnAPushSubscriptionIsRecorded(String action, String alias, String details) {
        assertThat(recordedDetails(action, alias, "client is null")).containsExactly(details);
    }

    @Then("the admin action {string} by {string} on a push subscription came through {string} with details {string}")
    public void theAdminActionOnAPushSubscriptionCameThrough(String action, String alias, String client, String details) {
        assertThat(jdbc.sql("select client from admin_action where action = ? and admin_id = ? and subject_id is not null and client is not null")
                .param(action).param(donors.idOf(alias)).query(String.class).list()).containsExactly(client);
        assertThat(recordedDetails(action, alias, "client is not null")).containsExactly(details);
    }

    private List<String> recordedDetails(String action, String alias, String clientCondition) {
        return jdbc.sql("select details from admin_action where action = ? and admin_id = ? and subject_id is not null and " + clientCondition
                        + " order by performed_at, id")
                .param(action).param(donors.idOf(alias)).query(String.class).list();
    }

    private void subscribe(String alias, String device, String endpoint, PushReceiver receiver, String p256dh) {
        String key = alias + "/" + device;
        UUID deviceId = devices.containsKey(key) ? devices.get(key).deviceId() : UUID.nameUUIDFromBytes(key.getBytes(StandardCharsets.UTF_8));
        actOnDevice(alias, deviceId);
        api.post(SUBSCRIPTIONS, body(endpoint, p256dh, receiver.auth()));
        String subscriptionId = api.lastResponse().getStatusCode().value() == CREATED ? api.lastResponseJson().get("id").asString() : null;
        devices.put(key, new Device(deviceId, URI.create(endpoint), receiver, subscriptionId));
    }

    private void actOnDevice(String alias, UUID deviceId) {
        sessions.actAs(alias);
        signedIn(alias, deviceId);
        actWith(alias, claims -> claims.claim(SESSION_CLAIM, deviceId.toString()));
    }

    private void actWithoutDevice(String alias) {
        sessions.actAs(alias);
        actWith(alias, claims -> claims.claims(all -> all.remove(SESSION_CLAIM)));
    }

    private void actWith(String alias, Consumer<JwtClaimsSet.Builder> session) {
        Jwt browserToken = decoder.decode(donors.accessTokenOf(alias));
        JwtClaimsSet.Builder claims = JwtClaimsSet.builder();
        browserToken.getClaims().forEach(claims::claim);
        session.accept(claims);
        String token = encoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), claims.build())).getTokenValue();
        api.forgetCredentials();
        api.authorize(token);
    }

    private void signedIn(String alias, UUID deviceId) {
        Instant now = clock.instant();
        UUID donorId = donors.idOf(alias);
        jdbc.sql("""
                insert into donor_device (id, donor_id, platform, browser, signed_in_at, last_used_at)
                values (:id, :donor, 'OTHER', 'OTHER', :now, :now) on conflict (id) do nothing""")
                .param("id", deviceId).param("donor", donorId).param("now", Timestamp.from(now)).update();
        jdbc.sql("""
                insert into donor_refresh_token (id, donor_id, secret_hash, issued_at, granted_at, expires_at, device_id)
                select :id, d.donor_id, :hash, :now, :now, :expires, d.id from donor_device d where d.id = :device""")
                .param("id", UUID.randomUUID()).param("hash", HexFormat.of().formatHex(UUID.randomUUID().toString().repeat(2).getBytes(StandardCharsets.US_ASCII), 0, 32))
                .param("now", Timestamp.from(now)).param("expires", Timestamp.from(now.plus(Duration.ofDays(14)))).param("device", deviceId).update();
    }

    private Device device(String alias, String device) {
        Device known = devices.get(alias + "/" + device);
        assertThat(known).withFailMessage("%s has not turned push alerts on for the device %s in this scenario", alias, device).isNotNull();
        return known;
    }

    private static Map<String, Object> body(String endpoint, String p256dh, String auth) {
        return Map.of("endpoint", endpoint, "keys", Map.of("p256dh", p256dh, "auth", auth));
    }

    private static boolean on(String word) {
        return switch (word) {
            case "on" -> true;
            case "off" -> false;
            default -> throw new IllegalArgumentException("Expected on or off, got " + word);
        };
    }

    private static String onOff(boolean on) {
        return on ? "on" : "off";
    }

    private record Device(UUID deviceId, URI endpoint, PushReceiver receiver, String subscriptionId) {
    }
}

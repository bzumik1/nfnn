package cz.novanadeje.app.operations.cucumber;

import cz.novanadeje.app.cucumber.ApiClient;
import cz.novanadeje.app.cucumber.DonorSessions;
import cz.novanadeje.app.cucumber.ScenarioDonors;
import cz.novanadeje.app.operations.infrastructure.push.PushReceiver;
import cz.novanadeje.app.shared.infrastructure.config.PublicUrlProperties;
import cz.novanadeje.app.shared.infrastructure.security.JwtProperties;
import cz.novanadeje.app.support.AsyncTaskTracker;
import cz.novanadeje.app.support.MutableClock;
import cz.novanadeje.app.support.RecordingPushRetryTimer;
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
import tools.jackson.databind.json.JsonMapper;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Base64;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Consumer;

import static org.assertj.core.api.Assertions.assertThat;

public class PushStepDefinitions {

    private static final String PUSH = "/api/admin/operations/push";
    private static final String SUBSCRIPTIONS = PUSH + "/subscriptions";
    private static final String DONOR_PUSH = "/api/operations/push";
    private static final String DONOR_DEVICE = DONOR_PUSH + "/device";
    private static final String PUBLIC_KEY_SHAPE = "B[A-Za-z0-9_-]{86}";
    private static final long VAPID_LIFETIME_SECONDS = 3600;
    private static final int CREATED = 201;
    private static final JsonMapper JSON = JsonMapper.builder().build();

    private final ApiClient api;
    private final DonorSessions sessions;
    private final ScenarioDonors donors;
    private final RecordingPushTransport pushService;
    private final JwtEncoder encoder;
    private final JwtDecoder decoder;
    private final JdbcClient jdbc;
    private final PublicUrlProperties site;
    private final MutableClock clock;
    private final RecordingPushRetryTimer retries;
    private final AsyncTaskTracker asyncTasks;
    private final Map<String, Device> devices = new HashMap<>();
    private String publicKey;

    public PushStepDefinitions(ApiClient api, DonorSessions sessions, ScenarioDonors donors, RecordingPushTransport pushService, JwtEncoder encoder,
                               JwtDecoder decoder, JdbcClient jdbc, PublicUrlProperties site, MutableClock clock, RecordingPushRetryTimer retries,
                               AsyncTaskTracker asyncTasks) {
        this.api = api;
        this.sessions = sessions;
        this.donors = donors;
        this.pushService = pushService;
        this.encoder = encoder;
        this.decoder = decoder;
        this.jdbc = jdbc;
        this.site = site;
        this.clock = clock;
        this.retries = retries;
        this.asyncTasks = asyncTasks;
    }

    @When("{string} asks for the push settings")
    public void asksForThePushSettings(String alias) {
        sessions.actAs(alias);
        api.get(PUSH);
    }

    @When("{string} asks for the push settings on the device {string}")
    public void asksForThePushSettingsOnTheDevice(String alias, String device) {
        actOnDevice(alias, device(alias, device).deviceId());
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

    @When("{string} asks for the push settings in a browser session that names no device")
    public void asksForThePushSettingsInASessionThatNamesNoDevice(String alias) {
        actWithoutDevice(alias);
        api.get(PUSH);
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

    @When("{string} signs out the device {string} from the device {string}")
    public void signsOutTheDeviceFromTheDevice(String alias, String device, String from) {
        actOnDevice(alias, device(alias, from).deviceId());
        api.delete("/api/donors/me/devices/" + device(alias, device).deviceId());
    }

    @When("{string} signs out every other device from the device {string}")
    public void signsOutEveryOtherDeviceFromTheDevice(String alias, String from) {
        actOnDevice(alias, device(alias, from).deviceId());
        api.delete("/api/donors/me/devices");
    }

    @Then("{string} has push subscriptions on the devices {string}")
    public void hasPushSubscriptionsOnTheDevices(String alias, String names) {
        List<UUID> expected = Arrays.stream(names.split(",\\s*")).map(name -> device(alias, name).deviceId()).toList();
        assertThat(jdbc.sql("select device_id from operations_push_subscription where administrator_id = ?").param(donors.idOf(alias))
                .query(UUID.class).list()).containsExactlyInAnyOrderElementsOf(expected);
    }

    @When("{string} asks for the push notifications on the device {string}")
    public void asksForThePushNotificationsOnTheDevice(String alias, String device) {
        actOnDevice(alias, deviceIdOf(alias, device));
        api.get(DONOR_PUSH);
    }

    @When("{string} asks for the push notifications in a browser session that names no device")
    public void asksForThePushNotificationsInASessionThatNamesNoDevice(String alias) {
        actWithoutDevice(alias);
        api.get(DONOR_PUSH);
    }

    @When("someone without a token asks for the push notifications")
    public void someoneWithoutATokenAsksForThePushNotifications() {
        api.forgetCredentials();
        api.get(DONOR_PUSH);
    }

    @When("{string} turns push notifications on for the device {string} at {string}")
    public void turnsPushNotificationsOnForTheDeviceAt(String alias, String device, String endpoint) {
        PushReceiver receiver = PushReceiver.generate();
        subscribeDonor(alias, device, endpoint, receiver, receiver.p256dh(), Optional.empty(), DeviceSession.SIGNED_IN);
    }

    @When("{string} turns push notifications on for the device {string} at {string} with gifts {word} and yearly receipts {word}")
    public void turnsPushNotificationsOnWithChoices(String alias, String device, String endpoint, String gifts, String yearlyReceipts) {
        PushReceiver receiver = PushReceiver.generate();
        subscribeDonor(alias, device, endpoint, receiver, receiver.p256dh(), Optional.of(notifications(gifts, yearlyReceipts)), DeviceSession.SIGNED_IN);
    }

    @When("{string} turns push notifications on for the public computer {string} at {string}")
    public void turnsPushNotificationsOnForThePublicComputer(String alias, String device, String endpoint) {
        PushReceiver receiver = PushReceiver.generate();
        subscribeDonor(alias, device, endpoint, receiver, receiver.p256dh(), Optional.empty(), DeviceSession.PUBLIC_COMPUTER);
    }

    @When("{string} turns push notifications on for the signed-out device {string} at {string}")
    public void turnsPushNotificationsOnForTheSignedOutDevice(String alias, String device, String endpoint) {
        PushReceiver receiver = PushReceiver.generate();
        subscribeDonor(alias, device, endpoint, receiver, receiver.p256dh(), Optional.empty(), DeviceSession.SIGNED_OUT);
    }

    @When("{string} turns push notifications on in a browser session that names no device")
    public void turnsPushNotificationsOnInASessionThatNamesNoDevice(String alias) {
        actWithoutDevice(alias);
        PushReceiver receiver = PushReceiver.generate();
        api.put(DONOR_DEVICE, body("https://fcm.googleapis.com/fcm/send/" + alias.toLowerCase() + "-bez-zarizeni", receiver.p256dh(), receiver.auth()));
    }

    @Given("{string} turned push notifications on for the device {string} at {string}")
    public void turnedPushNotificationsOnForTheDeviceAt(String alias, String device, String endpoint) {
        turnsPushNotificationsOnForTheDeviceAt(alias, device, endpoint);
        assertThat(api.lastResponse().getStatusCode().value()).withFailMessage("Subscribing answered %s", api.lastResponse().getBody()).isEqualTo(200);
    }

    @Given("{string} turned push notifications on for {int} devices")
    public void turnedPushNotificationsOnForDevices(String alias, int count) {
        for (int index = 1; index <= count; index++) {
            turnedPushNotificationsOnForTheDeviceAt(alias, "zařízení " + index, "https://fcm.googleapis.com/fcm/send/" + alias.toLowerCase() + "-" + index);
        }
    }

    @When("{string} changes the push notifications of the device {string} to gifts {word} and yearly receipts {word}")
    public void changesThePushNotificationsOfTheDevice(String alias, String device, String gifts, String yearlyReceipts) {
        actOnDevice(alias, deviceIdOf(alias, device));
        api.put(DONOR_DEVICE + "/notifications", notifications(gifts, yearlyReceipts));
    }

    @When("{string} turns push notifications off for the device {string}")
    public void turnsPushNotificationsOffForTheDevice(String alias, String device) {
        actOnDevice(alias, deviceIdOf(alias, device));
        api.delete(DONOR_DEVICE);
    }

    @When("{string} sends a test push notification on the device {string}")
    public void sendsATestPushNotificationOnTheDevice(String alias, String device) {
        actOnDevice(alias, deviceIdOf(alias, device));
        api.post(DONOR_PUSH + "/test", Map.of());
    }

    @Given("{string} sent {int} test push notifications on the device {string}")
    public void sentTestPushNotificationsOnTheDevice(String alias, int count, String device) {
        for (int index = 0; index < count; index++) {
            sendsATestPushNotificationOnTheDevice(alias, device);
            assertThat(api.lastResponse().getStatusCode().value()).withFailMessage("The test answered %s", api.lastResponse().getBody()).isEqualTo(200);
        }
    }

    @Then("the device says service {string} with gifts {word} and yearly receipts {word}")
    public void theDeviceSays(String service, String gifts, String yearlyReceipts) {
        JsonNode device = api.lastResponseJson();
        assertThat(device.get("service").asString()).isEqualTo(service);
        assertThat(onOff(device.get("notifications").get("gifts").asBoolean())).isEqualTo(gifts);
        assertThat(onOff(device.get("notifications").get("yearlyReceipts").asBoolean())).isEqualTo(yearlyReceipts);
        assertThat(device.has("endpoint")).isFalse();
        assertThat(device.has("keys")).isFalse();
    }

    @Then("the push notifications say this device gets none")
    public void thePushNotificationsSayThisDeviceGetsNone() {
        assertThat(api.lastResponseJson().get("device").isNull()).isTrue();
    }

    @Then("the push notifications say this device gets them from service {string} with gifts {word} and yearly receipts {word}, {word} delivered")
    public void thePushNotificationsSayThisDeviceGetsThem(String service, String gifts, String yearlyReceipts, String delivered) {
        JsonNode device = api.lastResponseJson().get("device");
        assertThat(device.get("service").asString()).isEqualTo(service);
        assertThat(onOff(device.get("notifications").get("gifts").asBoolean())).isEqualTo(gifts);
        assertThat(onOff(device.get("notifications").get("yearlyReceipts").asBoolean())).isEqualTo(yearlyReceipts);
        assertThat(device.get("lastDeliveredAt").isNull() ? "never" : "yes").isEqualTo("never".equals(delivered) ? "never" : "yes");
    }

    @Then("the push notifications say this device gets them from service {string} with gifts {word} and yearly receipts {word}, delivered")
    public void thePushNotificationsSayThisDeviceGetsThemDelivered(String service, String gifts, String yearlyReceipts) {
        thePushNotificationsSayThisDeviceGetsThem(service, gifts, yearlyReceipts, "yes");
    }

    @Then("the push notifications say this device failed {int} time(s) in a row")
    public void thePushNotificationsSayThisDeviceFailed(int failures) {
        assertThat(api.lastResponseJson().get("device").get("failuresInARow").asInt()).isEqualTo(failures);
    }

    @Then("the push notifications list the devices {string} of {string}")
    public void thePushNotificationsListTheDevices(String names, String alias) {
        List<UUID> expected = Arrays.stream(names.split(",\\s*")).map(name -> device(alias, name).deviceId()).toList();
        assertThat(jdbc.sql("select device_id from operations_donor_push_subscription where donor_id = ?").param(donors.idOf(alias))
                .query(UUID.class).list()).containsExactlyInAnyOrderElementsOf(expected);
        if (api.lastResponse().getStatusCode().value() == 200 && api.lastResponseJson().has("devices")) {
            List<UUID> listed = new ArrayList<>();
            api.lastResponseJson().get("devices").forEach(id -> listed.add(UUID.fromString(id.asString())));
            assertThat(listed).containsExactlyInAnyOrderElementsOf(expected);
        }
    }

    @Then("no push notification subscription of {string} is stored")
    public void noPushNotificationSubscriptionOfIsStored(String alias) {
        pushNotificationSubscriptionsOfAreStored(0, alias);
    }

    @Then("{int} push notification subscription(s) of {string} is/are stored")
    public void pushNotificationSubscriptionsOfAreStored(int count, String alias) {
        assertThat(jdbc.sql("select count(*) from operations_donor_push_subscription where donor_id = ?").param(donors.idOf(alias))
                .query(Long.class).single()).isEqualTo(count);
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
                    case "current" -> subscription.get("current").asBoolean() ? "yes" : "no";
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

    @Then("the push settings say the session names a device")
    public void thePushSettingsSayTheSessionNamesADevice() {
        assertThat(api.lastResponseJson().get("deviceSession").asBoolean()).isTrue();
    }

    @Then("the push settings say the session names no device")
    public void thePushSettingsSayTheSessionNamesNoDevice() {
        assertThat(api.lastResponseJson().get("deviceSession").asBoolean()).isFalse();
    }

    @Then("the push subscription is not the device of the asking session")
    public void thePushSubscriptionIsNotTheDeviceOfTheAskingSession() {
        assertThat(api.lastResponseJson().get("current").asBoolean()).isFalse();
    }

    @Then("the push settings list no open alert")
    public void thePushSettingsListNoOpenAlert() {
        assertThat(api.lastResponseJson().get("openAlerts").isEmpty()).isTrue();
    }

    @Then("the push settings list the open alerts:")
    public void thePushSettingsListTheOpenAlerts(DataTable table) {
        List<Map<String, String>> actual = new ArrayList<>();
        api.lastResponseJson().get("openAlerts").forEach(alert -> actual.add(Map.of("area", alert.get("area").asString(), "since", alert.get("since").asString())));
        assertThat(actual).containsExactlyElementsOf(table.asMaps());
    }

    @Then("the device {string} of {string} received no push alert")
    public void theDeviceReceivedNoPushAlert(String device, String alias) {
        asyncTasks.awaitIdleAfter("the push alerts");
        assertThat(sentTo(device(alias, device))).isEmpty();
    }

    @Then("the device {string} of {string} received the push alerts:")
    public void theDeviceReceivedThePushAlerts(String device, String alias, DataTable table) {
        asyncTasks.awaitIdleAfter("the push alerts");
        Device known = device(alias, device);
        List<Map<String, String>> actual = new ArrayList<>();
        for (RecordingPushTransport.Sent message : sentTo(known)) {
            JsonNode alert = JSON.readTree(known.receiver().decrypt(message.body()));
            JsonNode notification = alert.get("notification");
            actual.add(Map.of("kind", alert.get("kind").asString(), "count", alert.get("count").asString(),
                    "title", notification.get("title").asString(), "url", notification.get("data").get("onActionClick").get("default").get("url").asString()));
        }
        assertThat(actual).containsExactlyElementsOf(table.asMaps());
    }

    @Then("a push alert retry is due in {int} minute(s)")
    public void aPushAlertRetryIsDueIn(int minutes) {
        asyncTasks.awaitIdleAfter("the push alerts");
        assertThat(retries.pending()).containsExactly(clock.instant().plus(Duration.ofMinutes(minutes)));
    }

    @Then("no push alert retry is due")
    public void noPushAlertRetryIsDue() {
        asyncTasks.awaitIdleAfter("the push alerts");
        assertThat(retries.pending()).isEmpty();
    }

    @When("the push alert retries run")
    public void thePushAlertRetriesRun() {
        asyncTasks.awaitIdleAfter("the push alerts");
        retries.pending().stream().max(Instant::compareTo).ifPresent(clock::set);
        retries.fireAll();
        asyncTasks.awaitIdleAfter("the push alert retries");
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
        UUID deviceId = devices.containsKey(key) ? devices.get(key).deviceId() : UUID.randomUUID();
        actOnDevice(alias, deviceId);
        api.post(SUBSCRIPTIONS, body(endpoint, p256dh, receiver.auth()));
        String subscriptionId = api.lastResponse().getStatusCode().value() == CREATED ? api.lastResponseJson().get("id").asString() : null;
        devices.put(key, new Device(deviceId, URI.create(endpoint), receiver, subscriptionId));
    }

    private void subscribeDonor(String alias, String device, String endpoint, PushReceiver receiver, String p256dh,
                                Optional<Map<String, Object>> notifications, DeviceSession session) {
        String key = alias + "/" + device;
        UUID deviceId = devices.containsKey(key) ? devices.get(key).deviceId() : UUID.randomUUID();
        sessions.actAs(alias);
        signedIn(alias, deviceId, session);
        actWith(alias, claims -> claims.claim(JwtProperties.SESSION_CLAIM, deviceId.toString()));
        Map<String, Object> request = new LinkedHashMap<>(body(endpoint, p256dh, receiver.auth()));
        notifications.ifPresent(chosen -> request.put("notifications", chosen));
        api.put(DONOR_DEVICE, request);
        devices.put(key, new Device(deviceId, URI.create(endpoint), receiver, null));
    }

    private UUID deviceIdOf(String alias, String device) {
        return devices.computeIfAbsent(alias + "/" + device, unknown -> new Device(UUID.randomUUID(), URI.create("https://unused.invalid"),
                PushReceiver.generate(), null)).deviceId();
    }

    private static Map<String, Object> notifications(String gifts, String yearlyReceipts) {
        return Map.of("gifts", on(gifts), "yearlyReceipts", on(yearlyReceipts));
    }

    private void actOnDevice(String alias, UUID deviceId) {
        sessions.actAs(alias);
        signedIn(alias, deviceId);
        actWith(alias, claims -> claims.claim(JwtProperties.SESSION_CLAIM, deviceId.toString()));
    }

    private void actWithoutDevice(String alias) {
        sessions.actAs(alias);
        actWith(alias, claims -> claims.claims(all -> all.remove(JwtProperties.SESSION_CLAIM)));
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
        signedIn(alias, deviceId, DeviceSession.SIGNED_IN);
    }

    private void signedIn(String alias, UUID deviceId, DeviceSession session) {
        Instant now = clock.instant();
        UUID donorId = donors.idOf(alias);
        jdbc.sql("""
                insert into donor_device (id, donor_id, platform, browser, signed_in_at, last_used_at, session_kind)
                values (:id, :donor, 'OTHER', 'OTHER', :now, :now, :kind) on conflict (id) do nothing""")
                .param("id", deviceId).param("donor", donorId).param("now", Timestamp.from(now))
                .param("kind", session == DeviceSession.PUBLIC_COMPUTER ? "PUBLIC" : null).update();
        if (session == DeviceSession.SIGNED_OUT) {
            jdbc.sql("update donor_device set ended_at = :now, end_reason = 'SIGNED_OUT' where id = :id")
                    .param("now", Timestamp.from(now)).param("id", deviceId).update();
            return;
        }
        jdbc.sql("""
                insert into donor_refresh_token (id, donor_id, secret_hash, issued_at, granted_at, expires_at, device_id)
                select :id, d.donor_id, :hash, :now, :now, :expires, d.id from donor_device d where d.id = :device""")
                .param("id", UUID.randomUUID()).param("hash", HexFormat.of().formatHex(UUID.randomUUID().toString().repeat(2).getBytes(StandardCharsets.US_ASCII), 0, 32))
                .param("now", Timestamp.from(now)).param("expires", Timestamp.from(now.plus(Duration.ofDays(14)))).param("device", deviceId).update();
    }

    private List<RecordingPushTransport.Sent> sentTo(Device device) {
        return pushService.sent().stream().filter(message -> message.endpoint().equals(device.endpoint())).toList();
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

    private enum DeviceSession {
        SIGNED_IN, PUBLIC_COMPUTER, SIGNED_OUT
    }
}

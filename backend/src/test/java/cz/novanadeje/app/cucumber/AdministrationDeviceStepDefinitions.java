package cz.novanadeje.app.cucumber;

import cz.novanadeje.app.donors.application.AdminActionFacts;
import cz.novanadeje.app.operations.application.backup.BackupKeySource;
import cz.novanadeje.app.operations.domain.backup.BackupKey;
import cz.novanadeje.app.shared.domain.FoundationZone;
import cz.novanadeje.app.shared.infrastructure.json.CanonicalRows;
import cz.novanadeje.app.shared.infrastructure.security.JwtProperties;
import io.cucumber.datatable.DataTable;
import io.cucumber.java.en.Given;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.JsonNodeFactory;
import tools.jackson.databind.node.ObjectNode;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Base64;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TreeMap;
import java.util.UUID;
import java.util.stream.Collectors;
import java.util.stream.IntStream;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;

public class AdministrationDeviceStepDefinitions {

    private static final Set<String> AREAS = Set.of("donations", "donors", "content", "operations");
    private static final List<String> PAYMENT_FIELDS = List.of("id", "bankTransactionId", "bookedOn", "amountMinor", "currency", "variableSymbol",
            "counterpartyAccount", "counterpartyName", "messageForRecipient", "importedAt", "unpairedByAdminAt", "accountVerification", "version");
    private static final List<String> AUDIT_FIELDS = List.of("id", "adminId", "action", "subjectId", "donorId", "summary", "performedAt",
            "client");
    private static final List<String> SYMBOL_CLAIM_FIELDS = List.of("id", "donorId", "variableSymbol", "answer", "answeredAt");
    private static final int MINIMUM_SECRET_LENGTH = 8;
    private static final int PERSONAL_VALUE_MINIMUM_LENGTH = 6;
    private static final JsonMapper JSON = JsonMapper.builder().build();

    private final ApiClient api;
    private final DonorSessions sessions;
    private final ScenarioDonors donors;
    private final JdbcClient jdbc;
    private final JwtEncoder encoder;
    private final JwtProperties jwt;
    private final Clock clock;
    private final BackupKeySource backupKeys;
    private final Map<String, Device> devices = new LinkedHashMap<>();
    private final Map<String, String> devicelessTokens = new HashMap<>();
    private final Map<String, String> erasedNames = new HashMap<>();
    private Device device;
    private String notedReportSettingsVersion;

    public AdministrationDeviceStepDefinitions(ApiClient api, DonorSessions sessions, ScenarioDonors donors, JdbcClient jdbc, JwtEncoder encoder,
                                               JwtProperties jwt, Clock clock, BackupKeySource backupKeys) {
        this.api = api;
        this.sessions = sessions;
        this.donors = donors;
        this.jdbc = jdbc;
        this.encoder = encoder;
        this.jwt = jwt;
        this.clock = clock;
        this.backupKeys = backupKeys;
    }

    @Given("{string} holds a browser token from before the signed-in devices")
    public void holdsABrowserTokenFromBeforeTheSignedInDevices(String alias) {
        sessions.actAs(alias);
        String payload = donors.accessTokenOf(alias).split("\\.")[1];
        JsonNode signedIn = JSON.readTree(new String(Base64.getUrlDecoder().decode(payload), StandardCharsets.UTF_8));
        Instant now = clock.instant();
        JwtClaimsSet claims = JwtClaimsSet.builder()
                .issuer(jwt.issuer())
                .subject(signedIn.get("sub").asString())
                .audience(List.of(jwt.audience()))
                .issuedAt(now)
                .expiresAt(now.plus(jwt.accessTokenTtl()))
                .claim(JwtProperties.ROLES_CLAIM, signedIn.get(JwtProperties.ROLES_CLAIM).valueStream().map(JsonNode::asString).toList())
                .build();
        devicelessTokens.put(alias, encoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), claims)).getTokenValue());
    }

    @When("an administration device of {string} syncs the {word}")
    public void anAdministrationDeviceSyncs(String alias, String area) {
        device = devices.computeIfAbsent(alias + " " + area, ignored -> new Device());
        act(alias);
        device.downloaded = List.of();
        device.removed = List.of();
        ResponseEntity<String> answered = api.get(manifestPath(area));
        assertThat(answered.getStatusCode().value()).withFailMessage("The manifest answered %s", answered.getBody()).isEqualTo(200);
        JsonNode manifest = api.lastResponseJson();
        Map<String, JsonNode> listed = new TreeMap<>();
        manifest.get("chunks").forEach(chunk -> listed.put(chunk.get("id").asString(), chunk));
        device.removed = device.chunks.keySet().stream().filter(id -> !listed.containsKey(id)).sorted().toList();
        device.removed.forEach(device.chunks::remove);
        device.downloaded = listed.values().stream()
                .filter(chunk -> !device.chunks.containsKey(chunk.get("id").asString())
                        || !device.chunks.get(chunk.get("id").asString()).get("rowsSha256").equals(chunk.get("rowsSha256")))
                .map(chunk -> chunk.get("id").asString())
                .toList();
        device.manifest = manifest;
        if (device.downloaded.isEmpty()) {
            return;
        }
        ResponseEntity<String> answer = api.get(chunksPath(area) + String.join(",", device.downloaded));
        assertThat(answer.getStatusCode().value()).withFailMessage("The chunks answered %s", answer.getBody()).isEqualTo(200);
        JsonNode chunks = api.lastResponseJson();
        assertThat(chunks.get("subject")).isEqualTo(manifest.get("subject"));
        assertThat(chunks.get("administrator")).isEqualTo(manifest.get("administrator"));
        assertThat(chunks.get("summary")).withFailMessage("The chunks came with another summary than their manifest: %s", chunks)
                .isEqualTo(manifest.get("summary"));
        assertThat(chunks.get("missing").isEmpty()).withFailMessage("Chunks went missing during a sync: %s", chunks).isTrue();
        chunks.get("chunks").forEach(chunk -> {
            JsonNode inManifest = listed.get(chunk.get("id").asString());
            assertThat(chunk.get("rowsSha256")).withFailMessage("The body of %s came with another rowsSha256 than its manifest", chunk.get("id"))
                    .isEqualTo(inManifest.get("rowsSha256"));
            assertThat(chunk.get("count")).isEqualTo(inManifest.get("count"));
            device.chunks.put(chunk.get("id").asString(), chunk);
        });
        assertThat(device.chunks.keySet()).isEqualTo(listed.keySet());
    }

    @When("{string} asks for the administration's {word} sync manifest")
    public void asksForTheAdministrationsSyncManifest(String alias, String area) {
        act(alias);
        api.get(manifestPath(area));
    }

    @When("{string} asks for the administration's {word} sync manifest {int} times")
    public void asksForTheAdministrationsSyncManifestTimes(String alias, String area, int times) {
        act(alias);
        IntStream.range(0, times).forEach(ignored -> assertThat(api.get(manifestPath(area)).getStatusCode().value()).isEqualTo(200));
    }

    @When("{string} asks for the administration's {word} sync chunks {string}")
    public void asksForTheAdministrationsSyncChunks(String alias, String area, String ids) {
        act(alias);
        api.get(chunksPath(area) + ids);
    }

    @When("{string} asks for the administration's {word} sync chunks {string} {int} times")
    public void asksForTheAdministrationsSyncChunksTimes(String alias, String area, String ids, int times) {
        act(alias);
        IntStream.range(0, times).forEach(ignored -> assertThat(api.get(chunksPath(area) + ids).getStatusCode().value()).isEqualTo(200));
    }

    @When("{string} asks for {int} of the administration's {word} sync chunks")
    public void asksForManyOfTheAdministrationsSyncChunks(String alias, int count, String area) {
        act(alias);
        api.get(chunksPath(area) + IntStream.range(0, count).mapToObj(index -> chunkIdOf(area, index)).collect(Collectors.joining(",")));
    }

    private static String chunkIdOf(String area, int index) {
        return switch (area) {
            case "content" -> List.of("news", "projects", "project-order", "about", "donate-band", "people").get(index % 6);
            case "operations" -> List.of("settings", "backups").get(index % 2);
            default -> ("donations".equals(area) ? "payments:" : "audit:") + (2000 + index / 12) + "-" + String.format("%02d", index % 12 + 1);
        };
    }

    @When("someone without a token asks for the administration's {word} sync manifest")
    public void someoneWithoutATokenAsksForTheAdministrationsSyncManifest(String area) {
        api.forgetCredentials();
        api.get(manifestPath(area));
    }

    @When("someone without a token asks for the administration's {word} sync chunks {string}")
    public void someoneWithoutATokenAsksForTheAdministrationsSyncChunks(String area, String ids) {
        api.forgetCredentials();
        api.get(chunksPath(area) + ids);
    }

    @Given("{string} keeps a passkey stored as {string}")
    public void keepsAPasskeyStoredAs(String alias, String credentialId) {
        jdbc.sql("insert into donor_passkey (id, donor_id, credential_id, credential_data, sign_count, transports, name, created_at, relying_party_id) "
                        + "values (:id, :donor, :credential, :data, 0, 'internal', 'Telefon', :at, 'nfnn.cz')")
                .param("id", UUID.randomUUID())
                .param("donor", donors.idOf(alias))
                .param("credential", credentialId)
                .param("data", (credentialId + "-stored-public-key").getBytes(java.nio.charset.StandardCharsets.UTF_8))
                .param("at", java.sql.Timestamp.from(Instant.parse("2026-10-01T10:00:00Z")))
                .update();
    }

    @Then("the administration device downloaded the chunks {string}")
    public void theAdministrationDeviceDownloadedTheChunks(String ids) {
        assertThat(device.downloaded).containsExactlyElementsOf(list(ids));
    }

    @Then("the administration device downloaded no chunk")
    public void theAdministrationDeviceDownloadedNoChunk() {
        assertThat(device.downloaded).isEmpty();
    }

    @Then("the administration device removed the chunks {string}")
    public void theAdministrationDeviceRemovedTheChunks(String ids) {
        assertThat(device.removed).containsExactlyElementsOf(list(ids));
    }

    @Then("the administration device removed no chunk")
    public void theAdministrationDeviceRemovedNoChunk() {
        assertThat(device.removed).isEmpty();
    }

    @Then("the administration device holds the chunk {string} with {int} row(s)")
    public void theAdministrationDeviceHoldsTheChunkWithRows(String id, int count) {
        assertThat(chunk(id).get("count").asInt()).isEqualTo(count);
        assertThat(chunk(id).get("rows").size()).isEqualTo(count);
    }

    @Then("every chunk on the administration device hashes to its rowsSha256")
    public void everyChunkOnTheAdministrationDeviceHashesToItsRowsSha256() {
        assertThat(device.chunks).isNotEmpty();
        device.chunks.forEach((id, chunk) -> assertThat(CanonicalRows.sha256(chunk.get("rows")))
                .as("the SHA-256 of the canonical rows of %s", id).isEqualTo(chunk.get("rowsSha256").asString()));
    }

    @Then("the administration device's copy names {string} as its subject and holds the administration")
    public void theAdministrationDevicesCopyNamesItsSubjectAndHoldsTheAdministration(String alias) {
        assertThat(device.manifest.get("subject").asString()).isEqualTo(donors.idOf(alias).toString());
        assertThat(device.manifest.get("administrator").asBoolean()).isTrue();
    }

    @Then("the administration device was told that {string} no longer holds the administration")
    public void theAdministrationDeviceWasToldNoLongerHoldsTheAdministration(String alias) {
        assertThat(device.manifest.get("subject").asString()).isEqualTo(donors.idOf(alias).toString());
        assertThat(device.manifest.get("administrator").asBoolean()).isFalse();
        assertThat(device.manifest.get("chunks").isEmpty()).isTrue();
        assertThat(device.chunks).isEmpty();
        if (device.manifest.has("summary")) {
            assertThat(device.manifest.get("summary").get("byYear").isEmpty()).isTrue();
        }
    }

    @Then("the administration device's summary lists the years {string}")
    public void theAdministrationDevicesSummaryListsTheYears(String years) {
        assertThat(device.manifest.get("summary").get("byYear").valueStream().map(year -> year.get("year").asString()).toList())
                .containsExactlyElementsOf(list(years));
    }

    @Then("the administration device's summary names the day {date} and the first receipt year the donor card reads")
    public void theAdministrationDevicesSummaryNamesTheDayAndTheFirstReceiptYear(LocalDate today) {
        JsonNode summary = device.manifest.get("summary");
        assertThat(summary.get("today").asString()).isEqualTo(today.toString());
        assertThat(api.get("/api/admin/donations/donors/" + device.manifest.get("subject").asString()).getStatusCode().value()).isEqualTo(200);
        assertThat(summary.get("receiptsAvailableFrom").asInt()).isEqualTo(api.lastResponseJson().get("receiptsAvailableFrom").asInt());
    }

    @Then("the administration device's summary of every year is the administration's overview of that year")
    public void theAdministrationDevicesSummaryOfEveryYearIsTheOverview() {
        List<JsonNode> years = device.manifest.get("summary").get("byYear").valueStream().toList();
        assertThat(years).isNotEmpty();
        for (JsonNode year : years) {
            api.get("/api/admin/donations/overview?year=" + year.get("year").asInt());
            ObjectNode overview = (ObjectNode) api.lastResponseJson().deepCopy();
            overview.remove("availableYears");
            assertThat(year).isEqualTo(overview);
        }
    }

    @Then("the administration device's chunks of payments hold every payment the administration lists, those of erased donors without the payer")
    public void theAdministrationDevicesChunksOfPaymentsHoldEveryListedPayment() {
        Set<String> erased = Set.copyOf(jdbc.sql("select donor_id from donor_record where erased_at is not null").query(UUID.class).list().stream()
                .map(UUID::toString).toList());
        Map<String, List<JsonNode>> listed = new TreeMap<>();
        listedPayments().forEach(item -> listed.put(item.get("id").asString(), fields(paidBy(item, erased) ? withoutPayer(item) : item,
                PAYMENT_FIELDS)));
        Map<String, List<JsonNode>> held = new TreeMap<>();
        rowsOfChunks("payments:").forEach((id, rows) -> rows.forEach(row -> {
            assertThat(fieldNames(row)).containsExactlyInAnyOrderElementsOf(PAYMENT_FIELDS);
            assertThat(id).isEqualTo("payments:" + row.get("bookedOn").asString().substring(0, 7));
            held.put(row.get("id").asString(), fields(row, PAYMENT_FIELDS));
        }));
        assertThat(listed).isNotEmpty();
        assertThat(held).isEqualTo(listed);
    }

    @Then("the administration device holds {int} payment(s) of {string}, each without the payer's name, account and message")
    public void theAdministrationDeviceHoldsPaymentsWithoutThePayer(int count, String alias) {
        Set<String> ofDonor = listedPayments().stream().filter(item -> paidBy(item, Set.of(donors.idOf(alias).toString())))
                .map(item -> item.get("id").asString()).collect(Collectors.toSet());
        List<JsonNode> held = rowsOfChunks("payments:").values().stream().flatMap(List::stream).filter(row -> ofDonor.contains(row.get("id").asString()))
                .toList();
        assertThat(held).hasSize(count);
        held.forEach(row -> assertThat(List.of(row.get("counterpartyName"), row.get("counterpartyAccount"), row.get("messageForRecipient")))
                .as("the payer of payment %s", row.get("bankTransactionId")).allMatch(JsonNode::isNull));
    }

    @Then("every gift on the administration device names a donor record, a payment, a bank account and an older-symbol answer it holds, {int} of them a bank account and {int} an older-symbol answer")
    public void everyGiftOnTheAdministrationDeviceNamesRowsItHolds(int throughAccounts, int bySymbols) {
        Set<String> records = idsOf("donor-records:", "donorId");
        Set<String> payments = idsOf("payments:", "id");
        Set<String> links = idsOf("links:", "id");
        Set<String> claims = idsOf("symbol-claims", "id");
        List<JsonNode> gifts = rowsOfChunks("donations:").values().stream().flatMap(List::stream).toList();
        assertThat(gifts).isNotEmpty();
        gifts.forEach(gift -> {
            assertThat(records).as("the donor of gift %s", gift.get("id")).contains(gift.get("donorId").asString());
            assertThat(gift.get("paymentId").isNull() || payments.contains(gift.get("paymentId").asString())).as("the payment of gift %s", gift.get("id"))
                    .isTrue();
            assertThat(gift.get("bankAccountId").isNull() || links.contains(gift.get("bankAccountId").asString()))
                    .as("the bank account of gift %s", gift.get("id")).isTrue();
            assertThat(gift.get("symbolClaimId").isNull() || claims.contains(gift.get("symbolClaimId").asString()))
                    .as("the older-symbol answer of gift %s", gift.get("id")).isTrue();
        });
        assertThat(gifts.stream().filter(gift -> !gift.get("bankAccountId").isNull()).count()).as("gifts through a bank account").isEqualTo(throughAccounts);
        assertThat(gifts.stream().filter(gift -> !gift.get("symbolClaimId").isNull()).count()).as("gifts by an older symbol").isEqualTo(bySymbols);
    }

    @Then("the administration device's chunks of donations hold every gift of {string} the administration lists")
    public void theAdministrationDevicesChunksOfDonationsHoldEveryGiftOf(String alias) {
        api.get("/api/admin/donations/donors/" + donors.idOf(alias));
        Map<String, String> listed = new TreeMap<>();
        api.lastResponseJson().get("donations").get("items").forEach(item -> listed.put(item.get("id").asString(),
                item.get("receivedAt").asString() + " " + item.get("amountMinor").asLong() + " " + item.get("status").asString()));
        Map<String, String> held = new TreeMap<>();
        rowsOfChunks("donations:").forEach((id, rows) -> rows.forEach(row -> {
            assertThat(id).isEqualTo("donations:" + row.get("receivedAt").asString().substring(0, 7));
            if (row.get("donorId").asString().equals(donors.idOf(alias).toString())) {
                held.put(row.get("id").asString(), row.get("receivedAt").asString() + " " + row.get("amountMinor").asLong() + " "
                        + row.get("status").asString());
            }
        }));
        assertThat(listed).isNotEmpty();
        assertThat(held).isEqualTo(listed);
    }

    @Then("the administration device holds the donor record of {string} as the administration reads it, with its bank accounts")
    public void theAdministrationDeviceHoldsTheDonorRecordOf(String alias) {
        api.get("/api/admin/donations/donors/" + donors.idOf(alias));
        JsonNode detail = api.lastResponseJson();
        assertThat(rowsOfChunks("donor-records:").values().stream().flatMap(List::stream)
                .filter(row -> row.get("donorId").asString().equals(donors.idOf(alias).toString())).toList())
                .containsExactly(detail.get("donor"));
        List<String> heldLinks = rowsOfChunks("links:").values().stream().flatMap(List::stream)
                .filter(row -> row.get("donorId").asString().equals(donors.idOf(alias).toString()))
                .map(row -> row.get("id").asString() + " " + row.get("accountNumber").asString() + " " + row.get("status").asString())
                .sorted().toList();
        List<String> listedLinks = detail.get("bankAccounts").valueStream()
                .map(account -> account.get("id").asString() + " " + account.get("accountNumber").asString() + " " + account.get("status").asString())
                .sorted().toList();
        assertThat(heldLinks).isEqualTo(listedLinks);
    }

    @Then("the administration device holds the donor record of {string} only as an erased placeholder, without bank accounts, older-symbol answers or receipts")
    public void theAdministrationDeviceHoldsAnErasedPlaceholder(String alias) {
        String id = donors.idOf(alias).toString();
        List<JsonNode> records = rowsOfChunks("donor-records:").values().stream().flatMap(List::stream)
                .filter(row -> row.get("donorId").asString().equals(id)).toList();
        assertThat(records).hasSize(1);
        assertThat(records.getFirst().get("erasedAt").isNull()).isFalse();
        assertThat(records.getFirst().get("name").asString()).isEqualTo("Vymazaný dárce");
        Stream.of("links:", "symbol-claims", "receipts:").forEach(prefix -> rowsOfChunks(prefix).values().stream().flatMap(List::stream)
                .forEach(row -> assertThat(row.get("donorId").asString()).as("a row of %s", prefix).isNotEqualTo(id)));
    }

    @Then("the administration device's chunk {string} holds every receipt the administration lists for {int}, except those of {string}")
    public void theAdministrationDevicesChunkHoldsEveryReceiptExceptThoseOf(String id, int year, String erased) {
        api.get("/api/admin/donations/receipts?limit=100");
        List<JsonNode> listed = api.lastResponseJson().get("items").valueStream()
                .filter(item -> !item.get("donorId").asString().equals(donors.idOf(erased).toString()))
                .toList();
        assertThat(listed).isNotEmpty();
        assertThat(chunk(id).get("rows").valueStream().toList()).containsExactlyElementsOf(listed);
    }

    @Then("the administration device's chunk {string} holds every receipt the administration lists")
    public void theAdministrationDevicesChunkHoldsEveryReceipt(String id) {
        api.get("/api/admin/donations/receipts?limit=100");
        List<JsonNode> listed = api.lastResponseJson().get("items").valueStream().toList();
        assertThat(listed).isNotEmpty();
        assertThat(chunk(id).get("rows").valueStream().toList()).containsExactlyElementsOf(listed);
    }

    @Then("every receipt of the administration device's chunk {string} names the verification key its donor card names")
    public void everyReceiptOfTheChunkNamesTheVerificationKeyItsDonorCardNames(String id) {
        List<JsonNode> rows = chunk(id).get("rows").valueStream().toList();
        assertThat(rows).isNotEmpty();
        for (JsonNode row : rows) {
            api.get("/api/admin/donations/donors/" + row.get("donorId").asString());
            JsonNode card = api.lastResponseJson().get("receipts").valueStream().filter(receipt -> receipt.get("id").equals(row.get("id"))).findFirst().orElseThrow();
            assertThat(row.get("keyId").asString()).isNotBlank().isEqualTo(card.get("keyId").asString());
        }
    }

    @Then("the administration device's chunk {string} holds every older-symbol answer the administration lists")
    public void theAdministrationDevicesChunkHoldsEveryOlderSymbolAnswer(String id) {
        api.get("/api/admin/donations/symbol-claims");
        List<List<JsonNode>> listed = api.lastResponseJson().get("items").valueStream().map(item -> fields(item, SYMBOL_CLAIM_FIELDS)).toList();
        assertThat(listed).isNotEmpty();
        assertThat(chunk(id).get("rows").valueStream().map(row -> fields(row, SYMBOL_CLAIM_FIELDS)).toList()).containsExactlyElementsOf(listed);
    }

    @Then("the administration device's chunk {string} holds the stored import state the administration reads, without the run of older payments and the text of the failure")
    public void theAdministrationDevicesChunkHoldsTheStoredImportState(String id) {
        api.get("/api/admin/donations/import-state");
        ObjectNode expected = ((ObjectNode) api.lastResponseJson()).deepCopy();
        expected.remove("historyImport");
        expected.remove("defaultHistoryFrom");
        if (expected.get("lastFailure") instanceof ObjectNode failure) {
            failure.remove("message");
        }
        assertThat(chunk(id).get("rows").valueStream().toList()).containsExactly(expected);
    }

    @Then("the administration device's chunk {string} holds the failure {string} attempted at {string} without its text")
    public void theAdministrationDevicesChunkHoldsTheFailureWithoutItsText(String id, String kind, String attemptedAt) {
        api.get("/api/admin/donations/import-state");
        assertThat(api.lastResponseJson().get("lastFailure").get("message").isString()).as("the administration reads the text of the failure").isTrue();
        List<JsonNode> rows = chunk(id).get("rows").valueStream().toList();
        assertThat(rows).hasSize(1);
        JsonNode failure = rows.getFirst().get("lastFailure");
        assertThat(failure.propertyNames()).containsExactlyInAnyOrder("kind", "attemptedAt");
        assertThat(failure.get("kind").asString()).isEqualTo(kind);
        assertThat(failure.get("attemptedAt").asString()).isEqualTo(attemptedAt);
    }

    @Then("the administration device's chunk {string} holds the monthly report settings, the sent reports, the next report and the last ended month the administration reads")
    public void theAdministrationDevicesChunkHoldsTheReportSettings(String id) {
        api.get("/api/admin/donations/report");
        JsonNode report = api.lastResponseJson();
        ObjectNode expected = JsonNodeFactory.instance.objectNode();
        report.get("settings").properties().forEach(field -> expected.set(field.getKey(), field.getValue()));
        expected.set("sentReports", report.get("sentReports"));
        expected.set("nextReport", report.get("nextReport"));
        expected.set("lastEndedMonth", report.get("lastEndedMonth"));
        assertThat(chunk(id).get("rows").valueStream().toList()).containsExactly(expected);
    }

    @Then("the administration device notes the version of its report settings")
    public void theAdministrationDeviceNotesTheVersionOfItsReportSettings() {
        notedReportSettingsVersion = reportSettingsRow().get("version").asString();
    }

    @Then("the administration device's report settings keep the noted version, with the next report for {string} and the last ended month {string}")
    public void theAdministrationDevicesReportSettingsKeepTheNotedVersion(String nextMonth, String lastEndedMonth) {
        JsonNode row = reportSettingsRow();
        assertThat(notedReportSettingsVersion).as("the version noted before").isNotBlank();
        assertThat(row.get("version").asString()).isEqualTo(notedReportSettingsVersion);
        assertThat(row.get("nextReport").get("month").asString()).isEqualTo(nextMonth);
        assertThat(row.get("lastEndedMonth").asString()).isEqualTo(lastEndedMonth);
    }

    private JsonNode reportSettingsRow() {
        List<JsonNode> rows = chunk("report-settings").get("rows").valueStream().toList();
        assertThat(rows).hasSize(1);
        return rows.getFirst();
    }

    @Then("the administration device's chunks of accounts hold every account as the administration reads it")
    public void theAdministrationDevicesChunksOfAccountsHoldEveryAccount() {
        Map<String, List<JsonNode>> held = rowsOfChunks("accounts:");
        assertThat(held).isNotEmpty();
        held.forEach((id, rows) -> rows.forEach(row -> assertThat(id).isEqualTo("accounts:" + monthOf(row.get("registeredAt").asString()))));
        Comparator<JsonNode> byNameAndEmail = Comparator.comparing((JsonNode row) -> row.get("name").asString())
                .thenComparing(row -> String.valueOf(row.get("email")));
        held.values().stream().flatMap(List::stream).sorted(byNameAndEmail).forEach(row -> {
            api.get("/api/admin/donors/" + row.get("donorId").asString());
            assertThat(row).isEqualTo(api.lastResponseJson());
        });
    }

    @Then("the administration device's chunks of accounts hold {int} account(s)")
    public void theAdministrationDevicesChunksOfAccountsHold(int count) {
        assertThat(rowsOfChunks("accounts:").values().stream().mapToInt(List::size).sum()).isEqualTo(count);
    }

    @Then("the administration device's account of {string} says it has the second factor and {int} passkey(s)")
    public void theAdministrationDevicesAccountSays(String alias, int passkeys) {
        JsonNode account = rowsOfChunks("accounts:").values().stream().flatMap(List::stream)
                .filter(row -> row.get("donorId").asString().equals(donors.idOf(alias).toString())).findFirst().orElseThrow();
        assertThat(account.get("secondFactorEnabled").asBoolean()).isTrue();
        assertThat(account.get("passkeys").asInt()).isEqualTo(passkeys);
    }

    @Then("the administration device's chunks of the audit hold every action the administration lists, without details")
    public void theAdministrationDevicesChunksOfTheAuditHoldEveryAction() {
        assertTheAuditHoldsEveryListedAction(Map.of());
    }

    @Then("the administration device's chunks of the audit hold every action the administration lists, without details, these with another summary:")
    public void theAdministrationDevicesChunksOfTheAuditHoldEveryActionTheseWithAnotherSummary(DataTable table) {
        Map<String, String> otherSummaries = new LinkedHashMap<>();
        table.asMaps().forEach(row -> otherSummaries.put(row.get("action"), row.get("summary on the device")));
        assertTheAuditHoldsEveryListedAction(otherSummaries);
    }

    private void assertTheAuditHoldsEveryListedAction(Map<String, String> otherSummaries) {
        api.get("/api/admin/donors/actions?limit=200");
        Map<String, List<JsonNode>> listed = new TreeMap<>();
        Set<String> otherwiseSummarised = new java.util.HashSet<>();
        api.lastResponseJson().get("items").forEach(item -> {
            JsonNode expected = item;
            if (otherSummaries.containsKey(item.get("action").asString())) {
                String summary = otherSummaries.get(item.get("action").asString());
                ObjectNode copy = (ObjectNode) item.deepCopy();
                if ("null".equals(summary)) {
                    copy.putNull("summary");
                } else {
                    copy.put("summary", summary);
                }
                expected = copy;
                otherwiseSummarised.add(item.get("action").asString());
            }
            listed.put(item.get("id").asString(), fields(expected, AUDIT_FIELDS));
        });
        assertThat(otherwiseSummarised).as("the actions the scenario names with another summary on the device").isEqualTo(otherSummaries.keySet());
        Map<String, List<JsonNode>> held = new TreeMap<>();
        rowsOfChunks("audit:").forEach((id, rows) -> rows.forEach(row -> {
            assertThat(fieldNames(row)).containsExactlyInAnyOrderElementsOf(AUDIT_FIELDS);
            assertThat(id).isEqualTo("audit:" + monthOf(row.get("performedAt").asString()));
            held.put(row.get("id").asString(), fields(row, AUDIT_FIELDS));
        }));
        assertThat(listed).isNotEmpty();
        assertThat(held).isEqualTo(listed);
    }

    @Given("the trail holds an action {string} by {string} with the details:")
    public void theTrailHoldsAnActionByWithTheDetails(String action, String alias, String details) {
        jdbc.sql("insert into admin_action (id, admin_id, action, subject_id, details, performed_at) values (:id, :admin, :action, null, :details, :at)")
                .param("id", UUID.nameUUIDFromBytes((action + details).getBytes(StandardCharsets.UTF_8)))
                .param("admin", donors.idOf(alias))
                .param("action", action)
                .param("details", details)
                .param("at", java.sql.Timestamp.from(clock.instant()))
                .update();
    }

    @Then("the administration device's audit names {string} in {int} summaries")
    public void theAdministrationDevicesAuditNamesInSummaries(String alias, int count) {
        String name = jdbc.sql("select name from donor where id = :id").param("id", donors.idOf(alias)).query(String.class).single();
        List<JsonNode> naming = auditRowsAbout(alias);
        assertThat(naming).hasSize(count);
        naming.forEach(row -> assertThat(row.get("summary").asString()).contains(name));
        erasedNames.put(alias, name);
    }

    @Then("the administration device's audit names {string} in {int} summaries only as erased, never by name")
    public void theAdministrationDevicesAuditNamesOnlyAsErased(String alias, int count) {
        String name = erasedNames.get(alias);
        assertThat(name).as("the name the device's audit named before the erasure").isNotBlank();
        List<JsonNode> naming = auditRowsAbout(alias);
        assertThat(naming).hasSize(count);
        naming.stream().filter(row -> !row.get("action").asString().equals("ERASE_DONOR"))
                .forEach(row -> assertThat(row.get("summary").asString()).contains("(osobní údaje vymazány)"));
        String held = device.chunks.values().stream().map(JsonNode::toString).collect(Collectors.joining("\n"));
        assertThat(held).doesNotContain(name);
    }

    private List<JsonNode> auditRowsAbout(String alias) {
        return rowsOfChunks("audit:").values().stream().flatMap(List::stream)
                .filter(row -> row.get("donorId").isString() && row.get("donorId").asString().equals(donors.idOf(alias).toString())).toList();
    }

    @Then("no chunk on the administration device holds a stored secret or an audit detail")
    public void noChunkOnTheAdministrationDeviceHoldsAStoredSecret() {
        List<String> secrets = new ArrayList<>();
        secrets.addAll(jdbc.sql("select password_hash from donor where password_hash is not null").query(String.class).list());
        secrets.addAll(jdbc.sql("select secret from donor_second_factor").query(String.class).list());
        secrets.addAll(jdbc.sql("select credential_id from donor_passkey").query(String.class).list());
        secrets.addAll(jdbc.sql("select encode(credential_data, 'base64') from donor_passkey").query(String.class).list());
        secrets.addAll(jdbc.sql("select encode(credential_data, 'hex') from donor_passkey").query(String.class).list());
        Stream.of("donor_refresh_token", "donor_password_reset_token", "donor_email_verification_token", "donor_second_factor_challenge",
                        "oauth_authorization_code")
                .forEach(table -> secrets.addAll(jdbc.sql("select secret_hash from " + table).query(String.class).list()));
        secrets.addAll(jdbc.sql("select challenge_hash from donor_passkey_challenge").query(String.class).list());
        secrets.addAll(jdbc.sql("select code_hash from donor_second_factor_recovery").query(String.class).list());
        secrets.addAll(jdbc.sql("select code from donor_second_factor_recovery").query(String.class).list());
        secrets.addAll(jdbc.sql("select code_challenge from oauth_authorization_code").query(String.class).list());
        secrets.addAll(jdbc.sql("select details from admin_action").query(String.class).list());
        secrets.addAll(personalValuesOfTheTrail());
        List<String> worthChecking = secrets.stream().filter(secret -> secret != null && secret.strip().length() >= MINIMUM_SECRET_LENGTH)
                .map(String::strip).toList();
        assertThat(worthChecking).isNotEmpty();
        Stream.of("donor_password_reset_token", "donor_second_factor_recovery", "oauth_authorization_code", "donor_refresh_token", "donor_passkey",
                        "donor_second_factor")
                .forEach(table -> assertThat(jdbc.sql("select count(*) from " + table).query(Integer.class).single())
                        .as("the rows of %s the scenario holds to look for", table).isPositive());
        assertThat(devices.keySet()).as("the copies scanned").anyMatch(key -> key.endsWith("donations")).anyMatch(key -> key.endsWith("donors"));
        String held = devices.values().stream().flatMap(copy -> copy.chunks.values().stream()).map(JsonNode::toString).collect(Collectors.joining("\n"));
        assertThat(held).isNotEmpty();
        worthChecking.forEach(secret -> assertThat(held).as("the chunks on the administration devices").doesNotContain(secret));
        assertThat(held).doesNotContainIgnoringCase("password").doesNotContainIgnoringCase("secret").doesNotContainIgnoringCase("credential")
                .doesNotContain("\"details\"");
    }

    @Then("no chunk on any administration device holds an audit detail or a bank account or address the details name")
    public void noChunkOnAnyAdministrationDeviceHoldsAnAuditDetailOrAValueItsShapesCapture() {
        List<String> details = jdbc.sql("select details from admin_action").query(String.class).list();
        List<String> captured = personalValuesOfTheTrail();
        assertThat(details).as("the details stored").isNotEmpty();
        assertThat(captured).as("the accounts and addresses the details name").isNotEmpty();
        String held = everythingHeld();
        assertThat(held).isNotEmpty().doesNotContain("\"details\"");
        Stream.concat(details.stream(), captured.stream())
                .forEach(value -> assertThat(held).as("the chunks on the administration devices").doesNotContain(value.strip()));
    }

    @Then("the administration device's chunk {string} holds the items the administration reads at {string}")
    public void theAdministrationDevicesChunkHoldsTheItemsTheAdministrationReadsAt(String id, String path) {
        assertThat(api.get(path).getStatusCode().value()).isEqualTo(200);
        List<JsonNode> listed = api.lastResponseJson().get("items").valueStream().toList();
        assertThat(listed).isNotEmpty();
        assertThat(chunk(id).get("rows").valueStream().toList()).containsExactlyElementsOf(listed);
    }

    @Then("the administration device's chunk {string} holds what the administration reads at {string}")
    public void theAdministrationDevicesChunkHoldsWhatTheAdministrationReadsAt(String id, String path) {
        assertThat(api.get(path).getStatusCode().value()).isEqualTo(200);
        assertThat(chunk(id).get("rows").valueStream().toList()).containsExactly(api.lastResponseJson());
    }

    @Then("the administration device's chunk {string} holds what the administration reads at {string}, each run without its error text")
    public void theAdministrationDevicesChunkHoldsWhatTheAdministrationReadsAtWithoutRunErrors(String id, String path) {
        assertThat(api.get(path).getStatusCode().value()).isEqualTo(200);
        ObjectNode expected = ((ObjectNode) api.lastResponseJson()).deepCopy();
        Stream.of("lastBackup", "lastTestRestore", "lastRestore").forEach(run -> {
            if (expected.get(run) instanceof ObjectNode held) {
                held.putNull("error");
            }
        });
        assertThat(chunk(id).get("rows").valueStream().toList()).containsExactly(expected);
    }

    @Then("the administration reads the error {string} of the last backup at {string}")
    public void theAdministrationReadsTheErrorOfTheLastBackupAt(String error, String path) {
        assertThat(api.get(path).getStatusCode().value()).isEqualTo(200);
        assertThat(api.lastResponseJson().get("lastBackup").get("error").asString()).isEqualTo(error);
    }

    @Then("no chunk on any administration device holds the text {string}")
    public void noChunkOnAnyAdministrationDeviceHoldsTheText(String text) {
        assertThat(devices.values()).as("the copies scanned").anySatisfy(copy -> assertThat(copy.chunks).isNotEmpty());
        devices.forEach((copy, held) -> held.chunks.forEach((id, chunk) -> assertThat(chunk.toString()).as("the chunk %s of %s", id, copy)
                .doesNotContain(text)));
    }

    @Then("no audit chunk on the administration device holds the text {string}")
    public void noAuditChunkOnTheAdministrationDeviceHoldsTheText(String text) {
        Map<String, List<JsonNode>> audit = rowsOfChunks("audit:");
        assertThat(audit).as("the audit chunks scanned").isNotEmpty();
        audit.forEach((id, rows) -> assertThat(rows.toString()).as("the chunk %s", id).doesNotContain(text));
    }

    @Then("no chunk on any administration device holds any of the {int} receipt image(s), a receipt signature or an image's bytes")
    public void noChunkOnAnyAdministrationDeviceHoldsAReceiptImage(int receiptImages) {
        List<String> images = new ArrayList<>();
        images.addAll(jdbc.sql("select sha256 from receipt_image").query(String.class).list());
        images.addAll(jdbc.sql("select substr(encode(content, 'base64'), 1, 64) from receipt_image").query(String.class).list());
        images.addAll(jdbc.sql("select image_sha256 from donation_person_receipt_signature").query(String.class).list());
        images.addAll(jdbc.sql("select substr(encode(data, 'base64'), 1, 64) from content_media_variant").query(String.class).list());
        assertThat(jdbc.sql("select count(*) from receipt_image").query(Integer.class).single()).as("the receipt images stored").isEqualTo(receiptImages);
        String held = everythingHeld();
        assertThat(held).isNotEmpty().doesNotContain("data:image").doesNotContain("receipt-images").doesNotContain("receipt-signature");
        images.forEach(image -> assertThat(held).as("the chunks on the administration devices").doesNotContain(image));
    }

    @Then("the people on the administration device carry only their public portrait and web signature")
    public void thePeopleOnTheAdministrationDeviceCarryOnlyTheirPublicImages() {
        List<JsonNode> members = devices.values().stream().map(copy -> copy.chunks.get("people")).filter(java.util.Objects::nonNull)
                .flatMap(chunk -> chunk.get("rows").valueStream()).flatMap(row -> row.get("members").valueStream()).toList();
        assertThat(members).as("the people scanned").isNotEmpty();
        members.forEach(member -> {
            assertThat(fieldNames(member)).containsExactlyInAnyOrder("id", "name", "role", "position", "onBoard", "boardNote", "featured", "portrait",
                    "webSignature", "personalEmail", "fundEmail", "linkedToAccount");
            Stream.of(member.get("portrait"), member.get("webSignature")).filter(image -> !image.isNull()).forEach(image -> {
                assertThat(fieldNames(image)).containsExactlyInAnyOrder("id", "url", "width", "height");
                assertThat(image.get("url").asString()).isEqualTo("/api/content/media/" + image.get("id").asString());
            });
        });
        assertThat(members).anySatisfy(member -> assertThat(member.get("portrait").isNull()).isFalse());
    }

    @Then("no chunk on any administration device holds the backup key")
    public void noChunkOnAnyAdministrationDeviceHoldsTheBackupKey() {
        BackupKey key = backupKeys.current().orElseThrow(() -> new AssertionError("The test backend has no backup key"));
        String held = everythingHeld();
        assertThat(held).isNotEmpty().doesNotContain(key.value()).doesNotContain(String.join(" ", key.words().subList(0, 2)));
    }

    public String everythingHeld() {
        return devices.values().stream().flatMap(copy -> copy.chunks.values().stream()).map(JsonNode::toString).collect(Collectors.joining("\n"));
    }

    private List<String> personalValuesOfTheTrail() {
        List<String> values = new ArrayList<>();
        jdbc.sql("select action, details from admin_action").query((row, index) -> AdminActionFacts.read(row.getString("action"), row.getString("details")))
                .list().stream().flatMap(Optional::stream).forEach(facts -> {
                    facts.value(AdminActionFacts.ACCOUNT).ifPresent(values::add);
                    facts.value(AdminActionFacts.RECIPIENTS).ifPresent(recipients -> values.addAll(Arrays.asList(recipients.split(",\\s*"))));
                });
        return values.stream().filter(value -> value.strip().length() >= PERSONAL_VALUE_MINIMUM_LENGTH).toList();
    }

    @Then("no chunk on the administration device holds the text {string}")
    public void noChunkOnTheAdministrationDeviceHoldsTheText(String text) {
        assertThat(device.chunks).isNotEmpty();
        device.chunks.forEach((id, chunk) -> assertThat(chunk.toString()).as("the chunk %s", id).doesNotContain(text));
    }

    @Then("the administration's chunks answer holds {string} and lists {string} as missing")
    public void theAdministrationsChunksAnswerHoldsAndListsAsMissing(String held, String missing) {
        JsonNode answer = api.lastResponseJson();
        assertThat(answer.get("chunks").valueStream().map(chunk -> chunk.get("id").asString()).toList()).containsExactlyElementsOf(list(held));
        assertThat(answer.get("missing").valueStream().map(JsonNode::asString).toList()).containsExactlyElementsOf(list(missing));
    }

    private List<JsonNode> listedPayments() {
        List<JsonNode> listed = new ArrayList<>();
        api.get("/api/admin/donations/payments?pairing=unpaired&limit=500");
        api.lastResponseJson().get("items").forEach(listed::add);
        api.get("/api/admin/donations/payments?pairing=paired&limit=500");
        List<Integer> years = api.lastResponseJson().get("availableYears").valueStream().map(JsonNode::asInt).toList();
        for (int year : years) {
            api.get("/api/admin/donations/payments?pairing=paired&limit=500&year=" + year);
            api.lastResponseJson().get("items").forEach(listed::add);
        }
        return listed;
    }

    private static boolean paidBy(JsonNode payment, Set<String> donorIds) {
        JsonNode donation = payment.get("donation");
        return donation != null && !donation.isNull() && donorIds.contains(donation.get("donorId").asString());
    }

    private static JsonNode withoutPayer(JsonNode payment) {
        ObjectNode copy = (ObjectNode) payment.deepCopy();
        copy.putNull("counterpartyName");
        copy.putNull("counterpartyAccount");
        copy.putNull("messageForRecipient");
        return copy;
    }

    private Set<String> idsOf(String prefix, String field) {
        return rowsOfChunks(prefix).values().stream().flatMap(List::stream).map(row -> row.get(field).asString()).collect(Collectors.toSet());
    }

    private Map<String, List<JsonNode>> rowsOfChunks(String prefix) {
        Map<String, List<JsonNode>> rows = new TreeMap<>();
        device.chunks.forEach((id, chunk) -> {
            if (id.startsWith(prefix)) {
                rows.put(id, chunk.get("rows").valueStream().toList());
            }
        });
        return rows;
    }

    private JsonNode chunk(String id) {
        JsonNode chunk = device.chunks.get(id);
        assertThat(chunk).withFailMessage("The administration device holds no chunk %s, only %s", id, device.chunks.keySet()).isNotNull();
        return chunk;
    }

    private static String monthOf(String instant) {
        return java.time.YearMonth.from(Instant.parse(instant).atZone(FoundationZone.ZONE)).toString();
    }

    private static String manifestPath(String area) {
        assertThat(AREAS).contains(area);
        return "/api/admin/" + area + "/sync";
    }

    private static String chunksPath(String area) {
        return manifestPath(area) + "/chunks?ids=";
    }

    private static List<JsonNode> fields(JsonNode row, List<String> names) {
        List<JsonNode> values = new ArrayList<>();
        names.forEach(name -> values.add(row.get(name)));
        return values;
    }

    private static Set<String> fieldNames(JsonNode row) {
        return row.properties().stream().map(Map.Entry::getKey).collect(Collectors.toSet());
    }

    private static List<String> list(String ids) {
        return Arrays.stream(ids.split(",")).map(String::strip).filter(id -> !id.isEmpty()).toList();
    }

    private static final class Device {

        private final Map<String, JsonNode> chunks = new TreeMap<>();
        private JsonNode manifest;
        private List<String> downloaded = List.of();
        private List<String> removed = List.of();
    }

    private void act(String alias) {
        String deviceless = devicelessTokens.get(alias);
        if (deviceless == null) {
            sessions.actAs(alias);
            return;
        }
        api.forgetCredentials();
        api.authorize(deviceless);
    }
}

package cz.novanadeje.app.cucumber;

import cz.novanadeje.app.shared.domain.FoundationZone;
import cz.novanadeje.app.shared.infrastructure.json.CanonicalRows;
import cz.novanadeje.app.shared.infrastructure.security.JwtProperties;
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
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Base64;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.UUID;
import java.util.stream.Collectors;
import java.util.stream.IntStream;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;

public class AdministrationDeviceStepDefinitions {

    private static final Set<String> AREAS = Set.of("donations", "donors");
    private static final List<String> PAYMENT_FIELDS = List.of("id", "bankTransactionId", "bookedOn", "amountMinor", "currency", "variableSymbol",
            "counterpartyAccount", "counterpartyName", "messageForRecipient", "importedAt", "unpairedByAdminAt", "accountVerification");
    private static final List<String> AUDIT_FIELDS = List.of("id", "adminId", "action", "subjectId", "performedAt", "client");
    private static final List<String> SYMBOL_CLAIM_FIELDS = List.of("id", "donorId", "variableSymbol", "answer", "answeredAt");
    private static final int MINIMUM_SECRET_LENGTH = 8;
    private static final JsonMapper JSON = JsonMapper.builder().build();

    private final ApiClient api;
    private final DonorSessions sessions;
    private final ScenarioDonors donors;
    private final JdbcClient jdbc;
    private final JwtEncoder encoder;
    private final JwtProperties jwt;
    private final Clock clock;
    private final Map<String, Device> devices = new LinkedHashMap<>();
    private final Map<String, String> devicelessTokens = new HashMap<>();
    private Device device;

    public AdministrationDeviceStepDefinitions(ApiClient api, DonorSessions sessions, ScenarioDonors donors, JdbcClient jdbc, JwtEncoder encoder,
                                               JwtProperties jwt, Clock clock) {
        this.api = api;
        this.sessions = sessions;
        this.donors = donors;
        this.jdbc = jdbc;
        this.encoder = encoder;
        this.jwt = jwt;
        this.clock = clock;
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
        String prefix = "donations".equals(area) ? "payments:" : "audit:";
        api.get(chunksPath(area) + IntStream.range(0, count)
                .mapToObj(month -> prefix + (2000 + month / 12) + "-" + String.format("%02d", month % 12 + 1))
                .collect(Collectors.joining(",")));
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

    @Then("the administration device's chunk {string} holds every older-symbol answer the administration lists")
    public void theAdministrationDevicesChunkHoldsEveryOlderSymbolAnswer(String id) {
        api.get("/api/admin/donations/symbol-claims");
        List<List<JsonNode>> listed = api.lastResponseJson().get("items").valueStream().map(item -> fields(item, SYMBOL_CLAIM_FIELDS)).toList();
        assertThat(listed).isNotEmpty();
        assertThat(chunk(id).get("rows").valueStream().map(row -> fields(row, SYMBOL_CLAIM_FIELDS)).toList()).containsExactlyElementsOf(listed);
    }

    @Then("the administration device's chunk {string} holds the import state the administration reads")
    public void theAdministrationDevicesChunkHoldsTheImportState(String id) {
        api.get("/api/admin/donations/import-state");
        assertThat(chunk(id).get("rows").valueStream().toList()).containsExactly(api.lastResponseJson());
    }

    @Then("the administration device's chunk {string} holds the monthly report settings and the sent reports the administration reads")
    public void theAdministrationDevicesChunkHoldsTheReportSettings(String id) {
        api.get("/api/admin/donations/report");
        JsonNode report = api.lastResponseJson();
        ObjectNode expected = JsonNodeFactory.instance.objectNode();
        report.get("settings").properties().forEach(field -> expected.set(field.getKey(), field.getValue()));
        expected.set("sentReports", report.get("sentReports"));
        assertThat(chunk(id).get("rows").valueStream().toList()).containsExactly(expected);
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
        api.get("/api/admin/donors/actions?limit=200");
        Map<String, List<JsonNode>> listed = new TreeMap<>();
        api.lastResponseJson().get("items").forEach(item -> listed.put(item.get("id").asString(), fields(item, AUDIT_FIELDS)));
        Map<String, List<JsonNode>> held = new TreeMap<>();
        rowsOfChunks("audit:").forEach((id, rows) -> rows.forEach(row -> {
            assertThat(fieldNames(row)).containsExactlyInAnyOrderElementsOf(AUDIT_FIELDS);
            assertThat(id).isEqualTo("audit:" + monthOf(row.get("performedAt").asString()));
            held.put(row.get("id").asString(), fields(row, AUDIT_FIELDS));
        }));
        assertThat(listed).isNotEmpty();
        assertThat(held).isEqualTo(listed);
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

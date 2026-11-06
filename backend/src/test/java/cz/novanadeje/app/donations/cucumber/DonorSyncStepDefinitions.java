package cz.novanadeje.app.donations.cucumber;

import cz.novanadeje.app.cucumber.ApiClient;
import cz.novanadeje.app.cucumber.DonorSessions;
import cz.novanadeje.app.cucumber.ScenarioDonors;
import cz.novanadeje.app.shared.infrastructure.json.CanonicalRows;
import io.cucumber.datatable.DataTable;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;
import org.springframework.http.ResponseEntity;
import tools.jackson.databind.JsonNode;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.stream.Collectors;
import java.util.stream.IntStream;

import static org.assertj.core.api.Assertions.assertThat;

public class DonorSyncStepDefinitions {

    private static final String MANIFEST_PATH = "/api/donations/me/sync";
    private static final String CHUNKS_PATH = "/api/donations/me/sync/chunks?ids=";
    private static final String DONATIONS_CHUNK = "donations:";
    private static final List<String> BANK_ACCOUNT_FIELDS = List.of("id", "accountNumber", "status", "verifiedOn", "connectedFrom",
            "disconnectedOn", "shared", "pairingExcluded", "verificationPaymentOn", "symbolOffer");

    private final ApiClient api;
    private final DonorSessions sessions;
    private final ScenarioDonors donors;
    private final Map<String, Device> devices = new LinkedHashMap<>();
    private Device device;

    public DonorSyncStepDefinitions(ApiClient api, DonorSessions sessions, ScenarioDonors donors) {
        this.api = api;
        this.sessions = sessions;
        this.donors = donors;
    }

    @When("a device of {string} syncs")
    public void aDeviceSyncs(String alias) {
        device = devices.computeIfAbsent(alias, ignored -> new Device());
        sessions.actAs(alias);
        device.downloaded = List.of();
        device.removed = List.of();
        ResponseEntity<String> answered = api.get(MANIFEST_PATH);
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
        ResponseEntity<String> answer = api.get(CHUNKS_PATH + String.join(",", device.downloaded));
        assertThat(answer.getStatusCode().value()).withFailMessage("The chunks answered %s", answer.getBody()).isEqualTo(200);
        JsonNode chunks = api.lastResponseJson();
        assertThat(chunks.get("subject")).isEqualTo(manifest.get("subject"));
        assertThat(chunks.get("summary")).withFailMessage("The chunks came with another summary than their manifest: %s", chunks).isEqualTo(manifest.get("summary"));
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

    @When("{string} asks for her/his sync manifest")
    public void asksForTheSyncManifest(String alias) {
        sessions.actAs(alias);
        api.get(MANIFEST_PATH);
    }

    @When("{string} asks for her/his sync manifest {int} times")
    public void asksForTheSyncManifestTimes(String alias, int times) {
        sessions.actAs(alias);
        IntStream.range(0, times).forEach(ignored -> assertThat(api.get(MANIFEST_PATH).getStatusCode().value()).isEqualTo(200));
    }

    @When("{string} asks for the sync chunks {string}")
    public void asksForTheSyncChunks(String alias, String ids) {
        sessions.actAs(alias);
        api.get(CHUNKS_PATH + ids);
    }

    @When("{string} asks for the sync chunks {string} {int} times")
    public void asksForTheSyncChunksTimes(String alias, String ids, int times) {
        sessions.actAs(alias);
        IntStream.range(0, times).forEach(ignored -> assertThat(api.get(CHUNKS_PATH + ids).getStatusCode().value()).isEqualTo(200));
    }

    @When("{string} asks for {int} sync chunks")
    public void asksForManySyncChunks(String alias, int count) {
        sessions.actAs(alias);
        api.get(CHUNKS_PATH + IntStream.rangeClosed(1, count).mapToObj(year -> DONATIONS_CHUNK + (2000 + year)).collect(Collectors.joining(",")));
    }

    @When("someone without a token asks for the sync manifest")
    public void someoneWithoutATokenAsksForTheSyncManifest() {
        api.forgetCredentials();
        api.get(MANIFEST_PATH);
    }

    @When("someone without a token asks for the sync chunks {string}")
    public void someoneWithoutATokenAsksForTheSyncChunks(String ids) {
        api.forgetCredentials();
        api.get(CHUNKS_PATH + ids);
    }

    @Then("the device downloaded the chunks {string}")
    public void theDeviceDownloadedTheChunks(String ids) {
        assertThat(device.downloaded).containsExactlyElementsOf(list(ids));
    }

    @Then("the device downloaded no chunk")
    public void theDeviceDownloadedNoChunk() {
        assertThat(device.downloaded).isEmpty();
    }

    @Then("the device removed the chunks {string}")
    public void theDeviceRemovedTheChunks(String ids) {
        assertThat(device.removed).containsExactlyElementsOf(list(ids));
    }

    @Then("the device removed no chunk")
    public void theDeviceRemovedNoChunk() {
        assertThat(device.removed).isEmpty();
    }

    @Then("the device holds the chunk {string} with {int} row(s)")
    public void theDeviceHoldsTheChunkWithRows(String id, int count) {
        assertThat(chunk(id).get("count").asInt()).isEqualTo(count);
        assertThat(chunk(id).get("rows").size()).isEqualTo(count);
    }

    @Then("the device holds these chunks of donations:")
    public void theDeviceHoldsTheseChunksOfDonations(DataTable table) {
        Map<String, Integer> expected = new TreeMap<>();
        table.asMaps().forEach(row -> expected.put(row.get("id"), Integer.parseInt(row.get("count"))));
        Map<String, Integer> held = new TreeMap<>();
        device.chunks.forEach((id, chunk) -> {
            if (id.startsWith(DONATIONS_CHUNK)) {
                held.put(id, chunk.get("rows").size());
            }
        });
        assertThat(held).isEqualTo(expected);
    }

    @Then("the device's copy names {string} as its subject")
    public void theDevicesCopyNamesItsSubject(String alias) {
        assertThat(device.manifest.get("subject").asString()).isEqualTo(donors.idOf(alias).toString());
    }

    @Then("every chunk on the device hashes to its rowsSha256")
    public void everyChunkOnTheDeviceHashesToItsRowsSha256() {
        assertThat(device.chunks).isNotEmpty();
        device.chunks.forEach((id, chunk) -> assertThat(CanonicalRows.sha256(chunk.get("rows")))
                .as("the SHA-256 of the canonical rows of %s", id).isEqualTo(chunk.get("rowsSha256").asString()));
    }

    @Then("the device's chunk {string} holds the donations:")
    public void theDevicesChunkHoldsTheDonations(String id, DataTable table) {
        List<Map<String, String>> rows = chunk(id).get("rows").valueStream()
                .<Map<String, String>>map(row -> table.asLists().getFirst().stream().collect(Collectors.toMap(field -> field,
                        field -> row.get(field).isNull() ? "" : row.get(field).asString(), (first, second) -> first, LinkedHashMap::new)))
                .toList();
        assertThat(rows).containsExactlyElementsOf(table.asMaps());
    }

    @Then("the device's chunks of donations hold every donation {string} lists and no other")
    public void theDevicesChunksOfDonationsHoldEveryListedDonation(String alias) {
        sessions.actAs(alias);
        api.get("/api/donations/me");
        Map<String, String> listed = new TreeMap<>();
        api.lastResponseJson().get("items").forEach(item -> listed.put(item.get("id").asString(),
                item.get("receivedAt").asString() + " " + item.get("amountMinor").asLong() + " " + item.get("status").asString()));
        Map<String, String> held = new TreeMap<>();
        device.chunks.forEach((id, chunk) -> {
            if (id.startsWith(DONATIONS_CHUNK)) {
                chunk.get("rows").forEach(row -> {
                    assertThat(id).isEqualTo(DONATIONS_CHUNK + row.get("receivedAt").asString().substring(0, 4));
                    held.put(row.get("id").asString(), row.get("receivedAt").asString() + " " + row.get("amountMinor").asLong() + " "
                            + row.get("status").asString());
                });
            }
        });
        assertThat(held).isEqualTo(listed);
    }

    @Then("the device's summary totals {long} minor CZK in {int} donation(s)")
    public void theDevicesSummaryTotals(long totalAmountMinor, int count) {
        JsonNode summary = device.manifest.get("summary");
        assertThat(summary.get("totalAmountMinor").asLong()).isEqualTo(totalAmountMinor);
        assertThat(summary.get("currency").asString()).isEqualTo("CZK");
        assertThat(summary.get("count").asInt()).isEqualTo(count);
    }

    @Then("the device's summary by year is:")
    public void theDevicesSummaryByYearIs(DataTable table) {
        List<Map<String, String>> years = device.manifest.get("summary").get("byYear").valueStream()
                .map(year -> Map.of("year", year.get("year").asString(), "count", year.get("count").asString(),
                        "totalAmountMinor", year.get("totalAmountMinor").asString()))
                .toList();
        assertThat(years).containsExactlyElementsOf(table.asMaps());
    }

    @Then("the device's summary makes yearly receipts available through {int} from {int}")
    public void theDevicesSummaryMakesYearlyReceiptsAvailable(int through, int from) {
        JsonNode summary = device.manifest.get("summary");
        assertThat(summary.get("yearlyReceiptsAvailableThrough").asInt()).isEqualTo(through);
        assertThat(summary.get("receiptsAvailableFrom").asInt()).isEqualTo(from);
    }

    @Then("the device's summary says the bank data are as of the last import")
    public void theDevicesSummarySaysTheBankDataAreAsOfTheLastImport() {
        api.get("/api/donations/me/bank-check");
        JsonNode check = api.lastResponseJson();
        assertThat(check.get("bankDataAsOf").isNull()).isFalse();
        assertThat(device.manifest.get("summary").get("bankDataAsOf")).isEqualTo(check.get("bankDataAsOf"));
    }

    @Then("no chunk on the device holds a donation of {string}")
    public void noChunkOnTheDeviceHoldsADonationOf(String alias) {
        sessions.actAs(alias);
        api.get("/api/donations/me");
        List<String> theirs = api.lastResponseJson().get("items").valueStream().map(item -> item.get("id").asString()).toList();
        assertThat(theirs).isNotEmpty();
        String held = device.chunks.values().toString();
        assertThat(theirs).noneMatch(held::contains);
        assertThat(held).doesNotContain(donors.idOf(alias).toString());
    }

    @Then("the device's chunk {string} holds every receipt {string} lists for {int}")
    public void theDevicesChunkHoldsEveryReceiptListedFor(String id, String alias, int year) {
        sessions.actAs(alias);
        api.get("/api/donations/me/receipts");
        List<JsonNode> listed = api.lastResponseJson().get("items").valueStream()
                .filter(item -> item.get("year").isNull()
                        ? item.get("receipt").get("gifts").get(0).get("receivedOn").asString().startsWith(Integer.toString(year))
                        : item.get("year").asInt() == year)
                .toList();
        assertThat(listed).isNotEmpty();
        assertThat(chunk(id).get("rows").valueStream().toList()).containsExactlyElementsOf(listed);
    }

    @Then("the device's chunk {string} holds receipts with the statuses {string}")
    public void theDevicesChunkHoldsReceiptsWithTheStatuses(String id, String statuses) {
        assertThat(chunk(id).get("rows").valueStream().map(row -> row.get("status").asString()).toList())
                .containsExactly(statuses.split(",\\s*"));
    }

    @Then("the device's chunk {string} holds every bank account {string} lists")
    public void theDevicesChunkHoldsEveryListedBankAccount(String id, String alias) {
        sessions.actAs(alias);
        api.get("/api/donations/me/bank-accounts");
        Map<String, List<JsonNode>> listed = new TreeMap<>();
        api.lastResponseJson().get("items").forEach(item -> listed.put(item.get("id").asString(), fields(item)));
        Map<String, List<JsonNode>> held = new TreeMap<>();
        chunk(id).get("rows").forEach(row -> {
            assertThat(fieldNames(row)).containsExactlyInAnyOrderElementsOf(BANK_ACCOUNT_FIELDS);
            held.put(row.get("id").asString(), fields(row));
        });
        assertThat(listed).isNotEmpty();
        assertThat(held).isEqualTo(listed);
    }

    @Then("the device's chunk {string} holds symbol {string} of bank account {string} answered {string}")
    public void theDevicesChunkHoldsSymbol(String id, String symbol, String account, String answer) {
        List<Map<String, String>> rows = chunk(id).get("rows").valueStream()
                .map(row -> Map.of("variableSymbol", row.get("variableSymbol").asString(), "accountNumber", row.get("accountNumber").asString(),
                        "answer", row.get("answer").asString()))
                .toList();
        assertThat(rows).containsExactly(Map.of("variableSymbol", symbol, "accountNumber", account, "answer", answer));
    }

    @Then("the device's donation received on {date} names its bank account and its symbol claim")
    public void theDevicesDonationNamesItsBankAccountAndSymbolClaim(LocalDate receivedOn) {
        JsonNode donation = chunk(DONATIONS_CHUNK + receivedOn.getYear()).get("rows").valueStream()
                .filter(row -> row.get("receivedAt").asString().equals(receivedOn.toString()))
                .findFirst().orElseThrow();
        JsonNode claim = chunk("symbol-claims").get("rows").get(0);
        JsonNode account = chunk("bank-accounts").get("rows").valueStream()
                .filter(row -> row.get("accountNumber").asString().equals(claim.get("accountNumber").asString()))
                .findFirst().orElseThrow();
        assertThat(donation.get("symbolClaimId")).isEqualTo(claim.get("id"));
        assertThat(donation.get("bankAccountId")).isEqualTo(account.get("id"));
    }

    @Then("the chunks answer holds {string} and lists {string} as missing")
    public void theChunksAnswerHoldsAndListsAsMissing(String held, String missing) {
        JsonNode answer = api.lastResponseJson();
        assertThat(answer.get("chunks").valueStream().map(chunk -> chunk.get("id").asString()).toList()).containsExactlyElementsOf(list(held));
        assertThat(answer.get("missing").valueStream().map(JsonNode::asString).toList()).containsExactlyElementsOf(list(missing));
    }

    private JsonNode chunk(String id) {
        JsonNode chunk = device.chunks.get(id);
        assertThat(chunk).withFailMessage("The device holds no chunk %s, only %s", id, device.chunks.keySet()).isNotNull();
        return chunk;
    }

    private static List<JsonNode> fields(JsonNode row) {
        List<JsonNode> values = new ArrayList<>();
        BANK_ACCOUNT_FIELDS.forEach(field -> values.add(row.get(field)));
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
}

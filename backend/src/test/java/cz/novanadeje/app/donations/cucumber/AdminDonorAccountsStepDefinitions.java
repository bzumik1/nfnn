package cz.novanadeje.app.donations.cucumber;

import cz.novanadeje.app.cucumber.ApiClient;
import cz.novanadeje.app.cucumber.DonorSessions;
import cz.novanadeje.app.cucumber.ScenarioDonors;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.donations.domain.donor.SymbolClaimRepository;
import cz.novanadeje.app.shared.domain.VariableSymbol;
import io.cucumber.datatable.DataTable;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;
import tools.jackson.databind.JsonNode;

import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Predicate;

import static org.assertj.core.api.Assertions.assertThat;

public class AdminDonorAccountsStepDefinitions {

    private static final String DONORS_PATH = "/api/admin/donations/donors/";
    private static final UUID UNKNOWN = UUID.fromString("019a1c00-0000-7000-8000-00000000dead");
    private static final List<String> ACCOUNT_FIELDS = List.of("accountNumber", "status", "connectedFrom", "disconnectedOn", "donationCount",
            "totalAmountMinor", "lastDonationOn", "shared");
    private static final List<String> RECEIPT_FIELDS = List.of("number", "kind", "donationReceivedOn", "year", "issuedOn", "active");

    private final ApiClient api;
    private final DonorSessions sessions;
    private final ScenarioDonors scenarioDonors;
    private final SymbolClaimRepository claims;

    public AdminDonorAccountsStepDefinitions(ApiClient api, DonorSessions sessions, ScenarioDonors scenarioDonors, SymbolClaimRepository claims) {
        this.api = api;
        this.sessions = sessions;
        this.scenarioDonors = scenarioDonors;
        this.claims = claims;
    }

    @When("{string} opens the donations of {string}")
    public void opensTheDonationsOf(String alias, String donorAlias) {
        sessions.actAs(alias);
        api.get(DONORS_PATH + scenarioDonors.idOf(donorAlias));
    }

    @When("{string} opens the donations of an unknown donor")
    public void opensTheDonationsOfAnUnknownDonor(String alias) {
        sessions.actAs(alias);
        api.get(DONORS_PATH + UNKNOWN);
    }

    @When("someone without a token opens the donations of a donor")
    public void someoneWithoutATokenOpensTheDonationsOfADonor() {
        api.forgetCredentials();
        api.get(DONORS_PATH + UNKNOWN);
    }

    @When("{string} turns off the pairing from bank account {string} of {string}")
    public void turnsOffThePairingFromBankAccountOf(String alias, String accountNumber, String donorAlias) {
        UUID link = linkOf(alias, donorAlias, accountNumber, item -> !item.get("status").asString().equals("DISCONNECTED"));
        api.post(accountPath(donorAlias, link) + "/disconnect", Map.of());
    }

    @When("{string} turns on the pairing from bank account {string} of {string}")
    public void turnsOnThePairingFromBankAccountOf(String alias, String accountNumber, String donorAlias) {
        UUID link = linkOf(alias, donorAlias, accountNumber, item -> item.get("status").asString().equals("DISCONNECTED"));
        api.post(accountPath(donorAlias, link) + "/reconnect", Map.of());
    }

    @When("{string} turns off the pairing from the disconnected bank account {string} of {string}")
    public void turnsOffThePairingFromTheDisconnectedBankAccountOf(String alias, String accountNumber, String donorAlias) {
        UUID link = linkOf(alias, donorAlias, accountNumber, item -> item.get("status").asString().equals("DISCONNECTED"));
        api.post(accountPath(donorAlias, link) + "/disconnect", Map.of());
    }

    @When("{string} turns off the pairing from an unknown bank account of {string}")
    public void turnsOffThePairingFromAnUnknownBankAccountOf(String alias, String donorAlias) {
        sessions.actAs(alias);
        api.post(accountPath(donorAlias, UNKNOWN) + "/disconnect", Map.of());
    }

    @When("{string} removes bank account {string} of {string}")
    public void removesBankAccountOf(String alias, String accountNumber, String donorAlias) {
        UUID link = linkOf(alias, donorAlias, accountNumber, item -> true);
        api.delete(accountPath(donorAlias, link));
    }

    @When("{string} removes an unknown bank account of {string}")
    public void removesAnUnknownBankAccountOf(String alias, String donorAlias) {
        sessions.actAs(alias);
        api.delete(accountPath(donorAlias, UNKNOWN));
    }

    @Then("the donations card names {string} with the variable symbol of {string}")
    public void theDonationsCardNamesWithTheVariableSymbolOf(String name, String alias) {
        JsonNode donor = api.lastResponseJson().get("donor");
        assertThat(donor.get("donorId").asString()).isEqualTo(scenarioDonors.idOf(alias).toString());
        assertThat(donor.get("name").asString()).isEqualTo(name);
        assertThat(donor.get("variableSymbol").asString()).isEqualTo(scenarioDonors.variableSymbolOf(alias).value());
        assertThat(donor.get("type").asString()).isEqualTo("PERSON");
        assertThat(donor.get("address").get("city").asString()).isNotBlank();
        assertThat(donor.get("registeredAt").asString()).isNotBlank();
    }

    @Then("the donations card says the donor was erased on {date}")
    public void theDonationsCardSaysTheDonorWasErasedOn(LocalDate day) {
        assertThat(api.lastResponseJson().get("donor").get("erasedAt").asString()).startsWith(day.toString());
    }

    @Then("the donor's bank accounts are none")
    public void theDonorsBankAccountsAreNone() {
        assertThat(bankAccounts()).isEmpty();
    }

    @Then("the donor's bank accounts are:")
    public void theDonorsBankAccountsAre(DataTable table) {
        assertThat(rows(bankAccounts(), ACCOUNT_FIELDS)).containsExactlyElementsOf(wanted(table, ACCOUNT_FIELDS));
    }

    @Then("the donor's donations total {long} in {int} donation(s)")
    public void theDonorsDonationsTotalIn(long totalAmountMinor, int count) {
        JsonNode donations = api.lastResponseJson().get("donations");
        assertThat(donations.get("totalAmountMinor").asLong()).isEqualTo(totalAmountMinor);
        assertThat(donations.get("count").asInt()).isEqualTo(count);
        assertThat(donations.get("items")).hasSize(count);
    }

    @Then("the donor's donation received on {date} carries receipt number {string}")
    public void theDonorsDonationReceivedOnCarriesReceiptNumber(LocalDate receivedOn, String number) {
        assertThat(api.lastResponseJson().get("donations").get("items").valueStream())
                .filteredOn(item -> item.get("receivedAt").asString().equals(receivedOn.toString()))
                .singleElement()
                .satisfies(item -> assertThat(item.get("receiptNumber").asString()).isEqualTo(number));
    }

    @Then("the donor's receipts are none")
    public void theDonorsReceiptsAreNone() {
        assertThat(api.lastResponseJson().get("receipts")).isEmpty();
    }

    @Then("the donor's receipts are:")
    public void theDonorsReceiptsAre(DataTable table) {
        List<JsonNode> receipts = api.lastResponseJson().get("receipts").valueStream().toList();
        assertThat(rows(receipts, RECEIPT_FIELDS)).containsExactlyElementsOf(wanted(table, RECEIPT_FIELDS));
        assertThat(receipts).allSatisfy(receipt -> assertThat(UUID.fromString(receipt.get("id").asString())).isNotNull());
    }

    @Then("{string} has no stored answer about symbol {string}")
    public void hasNoStoredAnswerAboutSymbol(String alias, String symbol) {
        assertThat(claims.findByDonor(new DonorReference(scenarioDonors.idOf(alias))))
                .noneMatch(claim -> claim.symbol().equals(new VariableSymbol(symbol)));
    }

    private UUID linkOf(String alias, String donorAlias, String accountNumber, Predicate<JsonNode> condition) {
        opensTheDonationsOf(alias, donorAlias);
        return bankAccounts().stream()
                .filter(item -> item.get("accountNumber").asString().equals(accountNumber))
                .filter(condition)
                .map(item -> UUID.fromString(item.get("id").asString()))
                .findFirst()
                .orElseThrow(() -> new AssertionError("\"" + donorAlias + "\" has no such bank account " + accountNumber + " in "
                        + api.lastResponse().getBody()));
    }

    private String accountPath(String donorAlias, UUID link) {
        return DONORS_PATH + scenarioDonors.idOf(donorAlias) + "/bank-accounts/" + link;
    }

    private List<JsonNode> bankAccounts() {
        JsonNode json = api.lastResponseJson();
        JsonNode array = json.get("bankAccounts");
        assertThat(array).withFailMessage("No bank accounts in %s", json).isNotNull();
        return array.valueStream().toList();
    }

    private static List<Map<String, String>> rows(List<JsonNode> items, List<String> fields) {
        return items.stream().map(item -> {
            Map<String, String> row = new LinkedHashMap<>();
            fields.forEach(field -> row.put(field, item.get(field) == null || item.get(field).isNull() ? "" : item.get(field).asString()));
            return row;
        }).toList();
    }

    private static List<Map<String, String>> wanted(DataTable table, List<String> fields) {
        return table.asMaps().stream().map(row -> {
            Map<String, String> filled = new LinkedHashMap<>();
            fields.forEach(field -> filled.put(field, row.get(field) == null ? "" : row.get(field)));
            return filled;
        }).toList();
    }
}

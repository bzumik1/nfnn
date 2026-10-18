package cz.novanadeje.app.donations.cucumber;

import cz.novanadeje.app.cucumber.ApiClient;
import cz.novanadeje.app.cucumber.DonorSessions;
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

public class DonorBankAccountsStepDefinitions {

    private static final String BANK_ACCOUNTS_PATH = "/api/donations/me/bank-accounts";
    private static final List<String> ITEM_FIELDS = List.of("accountNumber", "status", "connectedFrom", "disconnectedOn", "donationCount",
            "totalAmountMinor", "lastDonationOn", "shared");

    private final ApiClient api;
    private final DonorSessions sessions;

    public DonorBankAccountsStepDefinitions(ApiClient api, DonorSessions sessions) {
        this.api = api;
        this.sessions = sessions;
    }

    @When("{string} asks for her/his bank accounts")
    public void asksForBankAccounts(String alias) {
        sessions.actAs(alias);
        api.get(BANK_ACCOUNTS_PATH);
    }

    @When("someone without a token asks for the bank accounts")
    public void someoneWithoutATokenAsksForTheBankAccounts() {
        api.forgetCredentials();
        api.get(BANK_ACCOUNTS_PATH);
    }

    @When("{string} disconnects bank account {string}")
    public void disconnectsBankAccount(String alias, String accountNumber) {
        UUID id = liveLinkOf(alias, accountNumber);
        api.post(BANK_ACCOUNTS_PATH + "/" + id + "/disconnect", Map.of());
    }

    @When("{string} reconnects bank account {string}")
    public void reconnectsBankAccount(String alias, String accountNumber) {
        UUID id = linkOf(alias, accountNumber, "DISCONNECTED");
        api.post(BANK_ACCOUNTS_PATH + "/" + id + "/reconnect", Map.of());
    }

    @When("{string} reconnects the connected bank account {string}")
    public void reconnectsTheConnectedBankAccount(String alias, String accountNumber) {
        UUID id = liveLinkOf(alias, accountNumber);
        api.post(BANK_ACCOUNTS_PATH + "/" + id + "/reconnect", Map.of());
    }

    @When("{string} disconnects the disconnected bank account {string}")
    public void disconnectsTheDisconnectedBankAccount(String alias, String accountNumber) {
        UUID id = linkOf(alias, accountNumber, "DISCONNECTED");
        api.post(BANK_ACCOUNTS_PATH + "/" + id + "/disconnect", Map.of());
    }

    @When("{string} tries to disconnect bank account {string} of {string}")
    public void triesToDisconnectBankAccountOf(String alias, String accountNumber, String owner) {
        UUID id = liveLinkOf(owner, accountNumber);
        sessions.actAs(alias);
        api.post(BANK_ACCOUNTS_PATH + "/" + id + "/disconnect", Map.of());
    }

    @Then("the bank account list is empty")
    public void theBankAccountListIsEmpty() {
        assertThat(items()).isEmpty();
    }

    @Then("the bank accounts are:")
    public void theBankAccountsAre(List<Map<String, String>> expected) {
        List<Map<String, String>> listed = items().stream().map(item -> {
            Map<String, String> row = new LinkedHashMap<>();
            ITEM_FIELDS.forEach(field -> row.put(field, item.get(field).isNull() ? "" : item.get(field).asString()));
            return row;
        }).toList();
        List<Map<String, String>> wanted = expected.stream().map(row -> {
            Map<String, String> filled = new LinkedHashMap<>();
            ITEM_FIELDS.forEach(field -> filled.put(field, row.get(field) == null ? "" : row.get(field)));
            return filled;
        }).toList();
        assertThat(listed).containsExactlyElementsOf(wanted);
        assertThat(items()).allSatisfy(item -> {
            assertThat(UUID.fromString(item.get("id").asString())).isNotNull();
            assertThat(item.get("currency").asString()).isEqualTo("CZK");
        });
    }

    @Then("bank account {string} was verified on {date}")
    public void bankAccountWasVerifiedOn(String accountNumber, LocalDate verifiedOn) {
        assertThat(items()).filteredOn(item -> item.get("accountNumber").asString().equals(accountNumber))
                .anySatisfy(item -> assertThat(item.get("verifiedOn").asString()).isEqualTo(verifiedOn.toString()));
    }

    @Then("the donation received on {date} is listed as paired by sender account {string}")
    public void theDonationIsListedAsPairedBySenderAccount(LocalDate receivedOn, String accountNumber) {
        assertThat(items()).filteredOn(item -> item.get("receivedAt").asString().equals(receivedOn.toString()))
                .singleElement()
                .satisfies(item -> {
                    assertThat(item.get("pairedBy").asString()).isEqualTo("SENDER_ACCOUNT");
                    assertThat(item.get("senderAccount").asString()).isEqualTo(accountNumber);
                });
    }

    @Then("the donation received on {date} is listed as paired by variable symbol without a sender account")
    public void theDonationIsListedAsPairedByVariableSymbol(LocalDate receivedOn) {
        assertThat(items()).filteredOn(item -> item.get("receivedAt").asString().equals(receivedOn.toString()))
                .singleElement()
                .satisfies(item -> {
                    assertThat(item.get("pairedBy").asString()).isEqualTo("VARIABLE_SYMBOL");
                    assertThat(item.get("senderAccount").isNull()).isTrue();
                });
    }

    private UUID liveLinkOf(String alias, String accountNumber) {
        return linkMatching(alias, accountNumber, item -> !item.get("status").asString().equals("DISCONNECTED"));
    }

    private UUID linkOf(String alias, String accountNumber, String status) {
        return linkMatching(alias, accountNumber, item -> item.get("status").asString().equals(status));
    }

    private UUID linkMatching(String alias, String accountNumber, Predicate<JsonNode> condition) {
        asksForBankAccounts(alias);
        return items().stream()
                .filter(item -> item.get("accountNumber").asString().equals(accountNumber))
                .filter(condition)
                .map(item -> UUID.fromString(item.get("id").asString()))
                .findFirst()
                .orElseThrow(() -> new AssertionError("\"" + alias + "\" has no such bank account " + accountNumber + " in "
                        + api.lastResponse().getBody()));
    }

    private List<JsonNode> items() {
        JsonNode json = api.lastResponseJson();
        JsonNode array = json.get("items");
        assertThat(array).withFailMessage("No items in %s", json).isNotNull();
        return array.valueStream().toList();
    }
}

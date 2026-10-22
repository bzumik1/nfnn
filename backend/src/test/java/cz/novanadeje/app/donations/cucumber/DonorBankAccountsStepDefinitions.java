package cz.novanadeje.app.donations.cucumber;

import cz.novanadeje.app.cucumber.ApiClient;
import cz.novanadeje.app.cucumber.DonorSessions;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;
import tools.jackson.databind.JsonNode;

import java.time.LocalDate;
import java.util.Arrays;
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

    @When("{string} asks for her/his/its bank accounts")
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

    @When("{string} confirms symbol {string} at bank account {string}")
    public void confirmsSymbolAtBankAccount(String alias, String symbol, String accountNumber) {
        UUID id = liveLinkOf(alias, accountNumber);
        api.post(symbolClaimPath(id, "confirm"), Map.of("variableSymbol", symbol));
    }

    @When("{string} declines symbol {string} at bank account {string}")
    public void declinesSymbolAtBankAccount(String alias, String symbol, String accountNumber) {
        UUID id = liveLinkOf(alias, accountNumber);
        api.post(symbolClaimPath(id, "decline"), Map.of("variableSymbol", symbol));
    }

    @When("{string} tries to confirm symbol {string} at bank account {string} of {string}")
    public void triesToConfirmSymbolAtBankAccountOf(String alias, String symbol, String accountNumber, String owner) {
        UUID id = liveLinkOf(owner, accountNumber);
        sessions.actAs(alias);
        api.post(symbolClaimPath(id, "confirm"), Map.of("variableSymbol", symbol));
    }

    @When("someone without a token confirms symbol {string} at a bank account")
    public void someoneWithoutATokenConfirmsSymbol(String symbol) {
        api.forgetCredentials();
        api.post(symbolClaimPath(UUID.randomUUID(), "confirm"), Map.of("variableSymbol", symbol));
    }

    @When("someone without a token declines symbol {string} at a bank account")
    public void someoneWithoutATokenDeclinesSymbol(String symbol) {
        api.forgetCredentials();
        api.post(symbolClaimPath(UUID.randomUUID(), "decline"), Map.of("variableSymbol", symbol));
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
            assertThat(item.get("pairingExcluded").isBoolean()).isTrue();
        });
    }

    @Then("bank account {string} was verified on {date}")
    public void bankAccountWasVerifiedOn(String accountNumber, LocalDate verifiedOn) {
        assertThat(items()).filteredOn(item -> item.get("accountNumber").asString().equals(accountNumber))
                .anySatisfy(item -> assertThat(item.get("verifiedOn").asString()).isEqualTo(verifiedOn.toString()));
    }

    @Then("bank account {string} asks about symbol {string} with {int} payment(s) from {string} to {string}")
    public void bankAccountAsksAboutSymbol(String accountNumber, String symbol, int paymentCount, String firstMonth, String lastMonth) {
        assertThat(rowsOf(accountNumber)).filteredOn(item -> !item.get("symbolOffer").isNull())
                .singleElement()
                .satisfies(item -> {
                    JsonNode offer = item.get("symbolOffer");
                    assertThat(offer.get("variableSymbol").asString()).isEqualTo(symbol);
                    assertThat(offer.get("paymentCount").asInt()).isEqualTo(paymentCount);
                    assertThat(offer.get("firstMonth").asString()).isEqualTo(firstMonth);
                    assertThat(offer.get("lastMonth").asString()).isEqualTo(lastMonth);
                    assertThat(offer.properties()).extracting(Map.Entry::getKey)
                            .containsExactlyInAnyOrder("variableSymbol", "paymentCount", "firstMonth", "lastMonth");
                });
    }

    @Then("bank account {string} asks about no symbol")
    public void bankAccountAsksAboutNoSymbol(String accountNumber) {
        assertThat(rowsOf(accountNumber)).allSatisfy(item -> assertThat(item.get("symbolOffer").isNull()).isTrue());
    }

    @Then("bank account {string} lists confirmed symbols {string}")
    public void bankAccountListsConfirmedSymbols(String accountNumber, String symbols) {
        List<JsonNode> rows = rowsOf(accountNumber);
        assertThat(confirmedSymbolsOf(rows.getFirst())).containsExactlyElementsOf(Arrays.asList(symbols.split(",\\s*")));
        assertThat(rows.subList(1, rows.size())).allSatisfy(item -> assertThat(confirmedSymbolsOf(item)).isEmpty());
    }

    @Then("bank account {string} lists no confirmed symbol")
    public void bankAccountListsNoConfirmedSymbol(String accountNumber) {
        assertThat(rowsOf(accountNumber)).allSatisfy(item -> assertThat(confirmedSymbolsOf(item)).isEmpty());
    }

    @Then("bank account {string} was last verified by a payment on {date}")
    public void bankAccountWasLastVerifiedByAPaymentOn(String accountNumber, LocalDate bookedOn) {
        assertThat(rowsOf(accountNumber))
                .allSatisfy(item -> assertThat(item.get("verificationPaymentOn").asString()).isEqualTo(bookedOn.toString()));
    }

    @Then("bank account {string} was never verified by a payment")
    public void bankAccountWasNeverVerifiedByAPayment(String accountNumber) {
        assertThat(rowsOf(accountNumber)).allSatisfy(item -> assertThat(item.get("verificationPaymentOn").isNull()).isTrue());
    }

    @Then("bank account {string} is excluded from pairing")
    public void bankAccountIsExcludedFromPairing(String accountNumber) {
        assertThat(items()).filteredOn(item -> item.get("accountNumber").asString().equals(accountNumber))
                .isNotEmpty()
                .allSatisfy(item -> assertThat(item.get("pairingExcluded").asBoolean()).isTrue());
    }

    @Then("the donation received on {date} is listed as paired by sender account {string}")
    public void theDonationIsListedAsPairedBySenderAccount(LocalDate receivedOn, String accountNumber) {
        assertThat(items()).filteredOn(item -> item.get("receivedAt").asString().equals(receivedOn.toString()))
                .singleElement()
                .satisfies(item -> {
                    assertThat(item.get("pairedBy").asString()).isEqualTo("SENDER_ACCOUNT");
                    assertThat(item.get("senderAccount").asString()).isEqualTo(accountNumber);
                    assertThat(item.get("confirmedSymbol").isNull()).isTrue();
                });
    }

    @Then("the donation received on {date} is listed as paired by confirmed symbol {string} through sender account {string}")
    public void theDonationIsListedAsPairedByConfirmedSymbol(LocalDate receivedOn, String symbol, String accountNumber) {
        assertThat(items()).filteredOn(item -> item.get("receivedAt").asString().equals(receivedOn.toString()))
                .singleElement()
                .satisfies(item -> {
                    assertThat(item.get("pairedBy").asString()).isEqualTo("CONFIRMED_SYMBOL");
                    assertThat(item.get("confirmedSymbol").asString()).isEqualTo(symbol);
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

    private static String symbolClaimPath(UUID id, String answer) {
        return BANK_ACCOUNTS_PATH + "/" + id + "/symbol-claim/" + answer;
    }

    private List<JsonNode> rowsOf(String accountNumber) {
        List<JsonNode> rows = items().stream().filter(item -> item.get("accountNumber").asString().equals(accountNumber)).toList();
        assertThat(rows).withFailMessage("No bank account %s in %s", accountNumber, api.lastResponse().getBody()).isNotEmpty();
        return rows;
    }

    private static List<String> confirmedSymbolsOf(JsonNode item) {
        JsonNode symbols = item.get("confirmedSymbols");
        assertThat(symbols).withFailMessage("No confirmed symbols in %s", item).isNotNull();
        return symbols.valueStream().map(JsonNode::asString).toList();
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

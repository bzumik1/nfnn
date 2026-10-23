package cz.novanadeje.app.donations.cucumber;

import cz.novanadeje.app.cucumber.ApiClient;
import cz.novanadeje.app.cucumber.DonorSessions;
import cz.novanadeje.app.cucumber.ScenarioDonors;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;
import org.springframework.jdbc.core.simple.JdbcClient;
import tools.jackson.databind.JsonNode;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.StreamSupport;

import static org.assertj.core.api.Assertions.assertThat;

public class AdminPaymentsStepDefinitions {

    private static final String PAYMENTS_PATH = "/api/admin/donations/payments";
    private static final String DONORS_PATH = "/api/admin/donations/donors";

    private final ApiClient api;
    private final DonorSessions sessions;
    private final ScenarioDonors scenarioDonors;
    private final JdbcClient jdbc;

    public AdminPaymentsStepDefinitions(ApiClient api, DonorSessions sessions, ScenarioDonors scenarioDonors, JdbcClient jdbc) {
        this.api = api;
        this.sessions = sessions;
        this.scenarioDonors = scenarioDonors;
        this.jdbc = jdbc;
    }

    @When("{string} asks for the unpaired payments")
    public void asksForTheUnpairedPayments(String alias) {
        sessions.actAs(alias);
        api.get(PAYMENTS_PATH + "?pairing=unpaired");
    }

    @When("{string} asks for the paired payments of {int}")
    public void asksForThePairedPaymentsOf(String alias, int year) {
        sessions.actAs(alias);
        api.get(PAYMENTS_PATH + "?pairing=paired&year=" + year);
    }

    @When("{string} asks for the unpaired payments with {string}")
    public void asksForTheUnpairedPaymentsWith(String alias, String query) {
        sessions.actAs(alias);
        api.get(PAYMENTS_PATH + "?pairing=unpaired&" + scenarioDonors.resolve(query));
    }

    @When("{string} asks for the paired payments of {string}")
    public void asksForThePairedPaymentsOfDonor(String alias, String donorAlias) {
        sessions.actAs(alias);
        api.get(PAYMENTS_PATH + "?pairing=paired&donorId=" + scenarioDonors.idOf(donorAlias));
    }

    @Then("the payment list counts {int} in total")
    public void thePaymentListCountsInTotal(int total) {
        assertThat(api.lastResponseJson().get("total").asInt()).isEqualTo(total);
    }

    @When("someone without a token asks for the unpaired payments")
    public void someoneWithoutATokenAsksForTheUnpairedPayments() {
        api.forgetCredentials();
        api.get(PAYMENTS_PATH);
    }

    @When("{string} pairs payment {long} with {string}")
    public void pairsPaymentWith(String alias, long transactionId, String donorAlias) {
        sessions.actAs(alias);
        api.post(PAYMENTS_PATH + "/" + paymentId(transactionId) + "/pair", Map.of("donorId", scenarioDonors.idOf(donorAlias).toString()));
    }

    @When("{string} pairs an unknown payment with {string}")
    public void pairsAnUnknownPaymentWith(String alias, String donorAlias) {
        sessions.actAs(alias);
        api.post(PAYMENTS_PATH + "/" + UUID.randomUUID() + "/pair", Map.of("donorId", scenarioDonors.idOf(donorAlias).toString()));
    }

    @When("{string} pairs payment {long} with an unknown donor")
    public void pairsPaymentWithAnUnknownDonor(String alias, long transactionId) {
        sessions.actAs(alias);
        api.post(PAYMENTS_PATH + "/" + paymentId(transactionId) + "/pair", Map.of("donorId", UUID.randomUUID().toString()));
    }

    @When("{string} pairs payment {long} without naming a donor")
    public void pairsPaymentWithoutNamingADonor(String alias, long transactionId) {
        sessions.actAs(alias);
        api.post(PAYMENTS_PATH + "/" + paymentId(transactionId) + "/pair", Map.of());
    }

    @When("{string} unpairs payment {long}")
    public void unpairsPayment(String alias, long transactionId) {
        sessions.actAs(alias);
        api.post(PAYMENTS_PATH + "/" + paymentId(transactionId) + "/unpair", null);
    }

    @When("{string} searches donors for {string}")
    public void searchesDonorsFor(String alias, String query) {
        sessions.actAs(alias);
        api.get(DONORS_PATH + "?query=" + scenarioDonors.resolve(query));
    }

    @Then("the {word} payments are none")
    public void thePaymentsAreNone(String kind) {
        assertThat(listedTransactionIds()).isEmpty();
    }

    @Then("^the (?:unpaired|listed) payments are ([0-9, ]+)$")
    public void theUnpairedPaymentsAre(String transactionIds) {
        List<Long> expected = Arrays.stream(transactionIds.split(",")).map(String::trim).map(Long::parseLong).toList();
        assertThat(listedTransactionIds()).containsExactlyElementsOf(expected);
    }

    @Then("unpaired payment {long} says:")
    public void unpairedPaymentSays(long transactionId, Map<String, String> expected) {
        JsonNode item = listedItem(transactionId);
        assertThat(item.get("donation").isNull()).isTrue();
        assertThat(item.get("unpairedByAdminAt").isNull()).isTrue();
        expected.forEach((path, value) -> assertThat(at(item, path).asString()).as(path).isEqualTo(value));
    }

    @Then("unpaired payment {long} is marked as unpaired by an administrator")
    public void unpairedPaymentIsMarkedAsUnpairedByAnAdministrator(long transactionId) {
        assertThat(listedItem(transactionId).get("unpairedByAdminAt").isNull()).isFalse();
    }

    @Then("paired payment {long} says:")
    public void pairedPaymentSays(long transactionId, Map<String, String> expected) {
        JsonNode item = listedItem(transactionId);
        assertThat(item.get("donation").isNull()).isFalse();
        expected.forEach((path, value) -> assertThat(at(item, path).asString()).as(path).isEqualTo(value));
    }

    @Then("^the paired list offers the years ([0-9, ]+)$")
    public void thePairedListOffersTheYears(String years) {
        List<Integer> expected = Arrays.stream(years.split(",")).map(String::trim).map(Integer::parseInt).toList();
        List<Integer> listed = StreamSupport.stream(api.lastResponseJson().get("availableYears").spliterator(), false).map(JsonNode::asInt).toList();
        assertThat(listed).containsExactlyElementsOf(expected);
    }

    @Then("the pairing changed no yearly receipt")
    public void thePairingChangedNoYearlyReceipt() {
        assertThat(api.lastResponseJson().get("donationId").asString()).isNotBlank();
        assertThat(api.lastResponseJson().get("changedYearlyReceipts")).isEmpty();
    }

    @Then("the pairing changed the yearly receipt for {int}")
    public void thePairingChangedTheYearlyReceiptFor(int year) {
        assertThat(changedYearlyReceipts()).containsExactly(year);
    }

    @Then("the unpairing changed no yearly receipt")
    public void theUnpairingChangedNoYearlyReceipt() {
        assertThat(api.lastResponseJson().get("changedYearlyReceipts")).isEmpty();
    }

    @Then("the unpairing changed the yearly receipt for {int}")
    public void theUnpairingChangedTheYearlyReceiptFor(int year) {
        assertThat(changedYearlyReceipts()).containsExactly(year);
    }

    @Then("the admin action {string} by {string} on payment {long} is recorded")
    public void theAdminActionByOnPaymentIsRecorded(String action, String alias, long transactionId) {
        List<String> details = jdbc.sql("select details from admin_action where action = ? and admin_id = ? and subject_id = ?")
                .param(action)
                .param(scenarioDonors.idOf(alias))
                .param(paymentId(transactionId))
                .query(String.class)
                .list();
        assertThat(details).hasSize(1);
        assertThat(details.getFirst()).contains(Long.toString(transactionId));
    }

    @Then("the found donors are none")
    public void theFoundDonorsAreNone() {
        assertThat(api.lastResponseJson().get("items")).isEmpty();
    }

    @Then("^the found donors are (\".+)$")
    public void theFoundDonorsAre(String aliases) {
        List<UUID> expected = Arrays.stream(aliases.replace(" and ", ",").split(","))
                .map(String::trim)
                .map(alias -> alias.replace("\"", ""))
                .map(scenarioDonors::idOf)
                .toList();
        List<UUID> found = new ArrayList<>();
        api.lastResponseJson().get("items").forEach(item -> found.add(UUID.fromString(item.get("donorId").asString())));
        assertThat(found).containsExactlyInAnyOrderElementsOf(expected);
    }

    private List<Integer> changedYearlyReceipts() {
        return StreamSupport.stream(api.lastResponseJson().get("changedYearlyReceipts").spliterator(), false).map(JsonNode::asInt).toList();
    }

    private List<Long> listedTransactionIds() {
        return StreamSupport.stream(api.lastResponseJson().get("items").spliterator(), false)
                .map(item -> item.get("bankTransactionId").asLong())
                .toList();
    }

    private JsonNode listedItem(long transactionId) {
        return StreamSupport.stream(api.lastResponseJson().get("items").spliterator(), false)
                .filter(item -> item.get("bankTransactionId").asLong() == transactionId)
                .findFirst()
                .orElseThrow(() -> new AssertionError("Bank payment " + transactionId + " is not listed"));
    }

    private UUID paymentId(long transactionId) {
        return jdbc.sql("select id from bank_payment where bank_transaction_id = ?").param(transactionId).query(UUID.class).single();
    }

    private static JsonNode at(JsonNode node, String path) {
        JsonNode current = node;
        for (String segment : path.split("\\.")) {
            current = current.get(segment);
            assertThat(current).as(path).isNotNull();
        }
        return current;
    }
}

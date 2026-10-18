package cz.novanadeje.app.donations.cucumber;

import cz.novanadeje.app.cucumber.ApiClient;
import cz.novanadeje.app.cucumber.ScenarioDonors;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;
import tools.jackson.databind.JsonNode;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;

public class DonorDonationsStepDefinitions {

    private static final String DONATIONS_PATH = "/api/donations/me";
    private static final String SUMMARY_PATH = "/api/donations/me/summary";
    private static final String CZECH = "cs";
    private static final String ENGLISH = "en";
    private static final List<String> ITEM_FIELDS = List.of("receivedAt", "amountMinor", "currency", "purpose", "status", "source");

    private final ApiClient api;
    private final ScenarioDonors scenarioDonors;

    public DonorDonationsStepDefinitions(ApiClient api, ScenarioDonors scenarioDonors) {
        this.api = api;
        this.scenarioDonors = scenarioDonors;
    }

    @When("{string} asks for her/his donations")
    public void asksForDonations(String alias) {
        getAs(alias, CZECH, DONATIONS_PATH);
    }

    @When("{string} asks for her/his donations in English")
    public void asksForDonationsInEnglish(String alias) {
        getAs(alias, ENGLISH, DONATIONS_PATH);
    }

    @When("{string} asks for her/his donations in {int}")
    public void asksForDonationsInYear(String alias, int year) {
        getAs(alias, CZECH, DONATIONS_PATH + "?year=" + year);
    }

    @When("{string} asks for her/his donations in year {string}")
    public void asksForDonationsInYearWritten(String alias, String year) {
        getAs(alias, CZECH, DONATIONS_PATH + "?year=" + year);
    }

    @When("{string} asks for her/his donation summary")
    public void asksForDonationSummary(String alias) {
        getAs(alias, CZECH, SUMMARY_PATH);
    }

    @When("someone without a token asks for the donations")
    public void someoneWithoutATokenAsksForTheDonations() {
        api.forgetCredentials();
        api.get(DONATIONS_PATH);
    }

    @When("someone without a token asks for the donation summary")
    public void someoneWithoutATokenAsksForTheDonationSummary() {
        api.forgetCredentials();
        api.get(SUMMARY_PATH);
    }

    @Then("the donation list is empty")
    public void theDonationListIsEmpty() {
        assertThat(items()).isEmpty();
    }

    @Then("the donation list holds:")
    public void theDonationListHolds(List<Map<String, String>> expected) {
        List<Map<String, String>> listed = items().stream()
                .map(item -> ITEM_FIELDS.stream().collect(Collectors.toMap(field -> field, field -> item.get(field).asString())))
                .toList();
        assertThat(listed).containsExactlyElementsOf(expected);
    }

    @Then("every listed donation has an id and no receipt number yet")
    public void everyListedDonationHasAnIdAndNoReceiptNumberYet() {
        assertThat(items()).isNotEmpty().allSatisfy(item -> {
            assertThat(UUID.fromString(item.get("id").asString())).isNotNull();
            assertThat(item.has("receiptNumber")).withFailMessage("No receiptNumber in %s", item).isTrue();
            assertThat(item.get("receiptNumber").isNull()).isTrue();
        });
    }

    @Then("the list totals {long} minor CZK in {int} donation(s)")
    public void theListTotals(long totalAmountMinor, int count) {
        assertTotals(totalAmountMinor, count);
    }

    @Then("the summary totals {long} minor CZK in {int} donation(s)")
    public void theSummaryTotals(long totalAmountMinor, int count) {
        assertTotals(totalAmountMinor, count);
    }

    @Then("the summary's last donation was received on {date}")
    public void theSummarysLastDonationWasReceivedOn(LocalDate receivedAt) {
        assertThat(api.lastResponseJson().get("lastReceivedAt").asString()).isEqualTo(receivedAt.toString());
    }

    @Then("the summary has no last donation")
    public void theSummaryHasNoLastDonation() {
        JsonNode json = api.lastResponseJson();
        assertThat(json.has("lastReceivedAt")).withFailMessage("No lastReceivedAt in %s", json).isTrue();
        assertThat(json.get("lastReceivedAt").isNull()).isTrue();
    }

    @Then("the summary by year is:")
    public void theSummaryByYearIs(List<Map<String, String>> expected) {
        List<Map<String, String>> years = byYear().stream()
                .map(year -> Map.of(
                        "year", year.get("year").asString(),
                        "count", year.get("count").asString(),
                        "totalAmountMinor", year.get("totalAmountMinor").asString()))
                .toList();
        assertThat(years).containsExactlyElementsOf(expected);
        assertThat(byYear()).allSatisfy(year -> assertThat(year.get("year").isInt()).isTrue());
    }

    @Then("the summary has no years")
    public void theSummaryHasNoYears() {
        assertThat(byYear()).isEmpty();
    }

    private void getAs(String alias, String language, String path) {
        api.forgetCredentials();
        api.authorize(scenarioDonors.accessTokenOf(alias));
        api.acceptLanguage(language);
        api.get(path);
    }

    private void assertTotals(long totalAmountMinor, int count) {
        JsonNode json = api.lastResponseJson();
        assertThat(json.get("totalAmountMinor").asLong()).withFailMessage("Unexpected totals in %s", json).isEqualTo(totalAmountMinor);
        assertThat(json.get("currency").asString()).isEqualTo("CZK");
        assertThat(json.get("count").asInt()).withFailMessage("Unexpected count in %s", json).isEqualTo(count);
    }

    private List<JsonNode> items() {
        return arrayField("items");
    }

    private List<JsonNode> byYear() {
        return arrayField("byYear");
    }

    private List<JsonNode> arrayField(String name) {
        JsonNode json = api.lastResponseJson();
        JsonNode array = json.get(name);
        assertThat(array).withFailMessage("No %s in %s", name, json).isNotNull();
        assertThat(array.isArray()).isTrue();
        return array.valueStream().toList();
    }
}

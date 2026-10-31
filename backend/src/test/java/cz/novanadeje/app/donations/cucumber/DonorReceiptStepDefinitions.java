package cz.novanadeje.app.donations.cucumber;

import cz.novanadeje.app.cucumber.ApiClient;
import cz.novanadeje.app.cucumber.DonorSessions;
import cz.novanadeje.app.cucumber.ScenarioDonors;
import cz.novanadeje.app.support.MutableClock;
import io.cucumber.java.en.Given;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.simple.JdbcClient;
import tools.jackson.databind.JsonNode;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

public class DonorReceiptStepDefinitions {

    private static final String DONATIONS_PATH = "/api/donations/me";
    private static final String V2_YEARLY_PDF_PATH = "/api/donations/me/receipts/yearly?year=";

    private final ApiClient api;
    private final DonorSessions sessions;
    private final ScenarioDonors scenarioDonors;
    private final JdbcClient jdbc;
    private final MutableClock clock;

    public DonorReceiptStepDefinitions(ApiClient api, DonorSessions sessions, ScenarioDonors scenarioDonors, JdbcClient jdbc, MutableClock clock) {
        this.api = api;
        this.sessions = sessions;
        this.scenarioDonors = scenarioDonors;
        this.jdbc = jdbc;
        this.clock = clock;
    }

    @Given("the time is {string}")
    public void theTimeIs(String instant) {
        clock.set(Instant.parse(instant));
    }

    @Given("the donation of {string} received on {date} was refunded")
    public void theDonationWasRefunded(String alias, LocalDate receivedOn) {
        int updated = jdbc.sql("update donation set status = 'REFUNDED' where id = ?").param(donationIdOf(alias, receivedOn)).update();
        assertThat(updated).isEqualTo(1);
    }

    @When("{string} changes her/his address to street {string}, postal code {string} and city {string}")
    public void changesTheAddress(String alias, String street, String postalCode, String city) {
        sessions.actAs(alias);
        ResponseEntity<String> response = api.patch("/api/donors/me",
                Map.of("address", Map.of("street", street, "city", city, "postalCode", postalCode)));
        assertThat(response.getStatusCode().value()).withFailMessage("Profile update answered %s", response.getBody()).isEqualTo(200);
    }

    @When("{string} asks the address of v2's PDF of her/his yearly receipt for {int}")
    public void asksTheAddressOfTheYearlyPdf(String alias, int year) {
        sessions.actAs(alias);
        api.getBytes(V2_YEARLY_PDF_PATH + year);
    }

    @When("{string} asks the address of v2's PDF of the receipt of her/his donation received on {date}")
    public void asksTheAddressOfTheSinglePdf(String alias, LocalDate receivedOn) {
        sessions.actAs(alias);
        api.getBytes(DONATIONS_PATH + "/" + donationIdOf(alias, receivedOn) + "/receipt");
    }

    @Then("{int} receipt(s) is/are stored")
    public void receiptsAreStored(int count) {
        assertThat(jdbc.sql("select count(*) from issued_receipt").query(Long.class).single()).isEqualTo(count);
    }

    @Then("{int} receipt(s) is/are active")
    public void receiptsAreActive(int count) {
        assertThat(jdbc.sql("select count(*) from issued_receipt where status = 'ACTIVE'").query(Long.class).single()).isEqualTo(count);
    }

    @Then("receipt {string} is superseded")
    public void receiptIsSuperseded(String number) {
        assertThat(jdbc.sql("select status from issued_receipt where number = ?").param(number).query(String.class).single()).isEqualTo("REPLACED");
        assertThat(jdbc.sql("select superseded_at is not null from issued_receipt where number = ?").param(number).query(Boolean.class).single())
                .isTrue();
    }

    @Then("the donation received on {date} is listed with receipt number {string}")
    public void theDonationIsListedWithReceiptNumber(LocalDate receivedOn, String number) {
        assertThat(listedDonation(receivedOn).get("receiptNumber").asString()).isEqualTo(number);
    }

    @Then("the donation received on {date} is listed without a receipt number and with status {string}")
    public void theDonationIsListedWithoutAReceiptNumber(LocalDate receivedOn, String status) {
        JsonNode donation = listedDonation(receivedOn);
        assertThat(donation.get("receiptNumber").isNull()).withFailMessage("Unexpected receipt number in %s", donation).isTrue();
        assertThat(donation.get("status").asString()).isEqualTo(status);
    }

    @Then("the donation received on {date} is listed with a receipt")
    public void theDonationIsListedWithAReceipt(LocalDate receivedOn) {
        assertReceiptAvailable(receivedOn, true);
    }

    @Then("the donation received on {date} is listed without a receipt")
    public void theDonationIsListedWithoutAReceipt(LocalDate receivedOn) {
        assertReceiptAvailable(receivedOn, false);
    }

    @Then("the donation received on {date} is listed as an account verification")
    public void theDonationIsListedAsAnAccountVerification(LocalDate receivedOn) {
        assertAccountVerification(receivedOn, true);
    }

    @Then("the donation received on {date} is listed as a gift")
    public void theDonationIsListedAsAGift(LocalDate receivedOn) {
        assertAccountVerification(receivedOn, false);
    }

    @Then("the summary makes receipts available from {int}")
    public void theSummaryMakesReceiptsAvailableFrom(int year) {
        JsonNode json = api.lastResponseJson();
        assertThat(json.get("receiptsAvailableFrom")).withFailMessage("No receiptsAvailableFrom in %s", json).isNotNull();
        assertThat(json.get("receiptsAvailableFrom").isInt()).withFailMessage("No integer year in %s", json).isTrue();
        assertThat(json.get("receiptsAvailableFrom").asInt()).isEqualTo(year);
    }

    @Then("the summary makes yearly receipts available through {int}")
    public void theSummaryMakesYearlyReceiptsAvailableThrough(int year) {
        JsonNode json = api.lastResponseJson();
        assertThat(json.get("yearlyReceiptsAvailableThrough").isInt()).withFailMessage("No integer year in %s", json).isTrue();
        assertThat(json.get("yearlyReceiptsAvailableThrough").asInt()).isEqualTo(year);
    }

    private UUID donationIdOf(String alias, LocalDate receivedOn) {
        return jdbc.sql("select id from donation where donor_id = ? and received_on = ?")
                .params(scenarioDonors.idOf(alias), receivedOn)
                .query(UUID.class)
                .single();
    }

    private void assertReceiptAvailable(LocalDate receivedOn, boolean available) {
        JsonNode donation = listedDonation(receivedOn);
        assertThat(donation.get("receiptAvailable")).withFailMessage("No receiptAvailable in %s", donation).isNotNull();
        assertThat(donation.get("receiptAvailable").isBoolean()).withFailMessage("No boolean receiptAvailable in %s", donation).isTrue();
        assertThat(donation.get("receiptAvailable").asBoolean()).withFailMessage("Unexpected receiptAvailable in %s", donation).isEqualTo(available);
    }

    private void assertAccountVerification(LocalDate receivedOn, boolean verification) {
        JsonNode donation = listedDonation(receivedOn);
        assertThat(donation.get("accountVerification")).withFailMessage("No accountVerification in %s", donation).isNotNull();
        assertThat(donation.get("accountVerification").isBoolean()).withFailMessage("No boolean accountVerification in %s", donation).isTrue();
        assertThat(donation.get("accountVerification").asBoolean()).withFailMessage("Unexpected accountVerification in %s", donation)
                .isEqualTo(verification);
    }

    private JsonNode listedDonation(LocalDate receivedOn) {
        JsonNode items = api.lastResponseJson().get("items");
        assertThat(items).withFailMessage("No items in %s", api.lastResponse().getBody()).isNotNull();
        return items.valueStream()
                .filter(item -> item.get("receivedAt").asString().equals(receivedOn.toString()))
                .findFirst()
                .orElseThrow(() -> new AssertionError("No donation received on " + receivedOn + " in " + items));
    }
}

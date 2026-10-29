package cz.novanadeje.app.donations.cucumber;

import cz.novanadeje.app.cucumber.ApiClient;
import cz.novanadeje.app.cucumber.DonorSessions;
import cz.novanadeje.app.cucumber.ScenarioDonors;
import cz.novanadeje.app.support.MutableClock;
import io.cucumber.java.After;
import io.cucumber.java.en.Given;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.simple.JdbcClient;
import tools.jackson.databind.JsonNode;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

public class DonorReceiptStepDefinitions {

    private static final String DONATIONS_PATH = "/api/donations/me";
    private static final String YEARLY_RECEIPT_PATH = "/api/donations/me/receipts/yearly?year=";
    private static final String NO_BREAK_SPACE = " ";

    private final ApiClient api;
    private final DonorSessions sessions;
    private final ScenarioDonors scenarioDonors;
    private final JdbcClient jdbc;
    private final MutableClock clock;
    private final List<byte[]> downloads = new ArrayList<>();
    private Instant clockBeforeScenarioTime;

    public DonorReceiptStepDefinitions(ApiClient api, DonorSessions sessions, ScenarioDonors scenarioDonors, JdbcClient jdbc, MutableClock clock) {
        this.api = api;
        this.sessions = sessions;
        this.scenarioDonors = scenarioDonors;
        this.jdbc = jdbc;
        this.clock = clock;
    }

    @After
    public void keepTheClockMovingForward() {
        if (clockBeforeScenarioTime != null && clock.instant().isBefore(clockBeforeScenarioTime)) {
            clock.set(clockBeforeScenarioTime);
        }
    }

    @Given("the time is {string}")
    public void theTimeIs(String instant) {
        if (clockBeforeScenarioTime == null) {
            clockBeforeScenarioTime = clock.instant();
        }
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

    @When("{string} downloads her/his/its yearly receipt for {int}")
    public void downloadsTheYearlyReceipt(String alias, int year) {
        downloadAs(alias, YEARLY_RECEIPT_PATH + year);
    }

    @When("{string} downloads her/his yearly receipt for year {string}")
    public void downloadsTheYearlyReceiptForYearWritten(String alias, String year) {
        downloadAs(alias, YEARLY_RECEIPT_PATH + year);
    }

    @When("{string} downloads the receipt of her/his donation received on {date}")
    public void downloadsTheReceiptOfTheirDonation(String alias, LocalDate receivedOn) {
        downloadAs(alias, singleReceiptPath(donationIdOf(alias, receivedOn).toString()));
    }

    @When("{string} downloads the receipt of the donation of {string} received on {date}")
    public void downloadsTheReceiptOfSomeoneElsesDonation(String alias, String owner, LocalDate receivedOn) {
        downloadAs(alias, singleReceiptPath(donationIdOf(owner, receivedOn).toString()));
    }

    @When("{string} downloads the receipt of donation {string}")
    public void downloadsTheReceiptOfDonation(String alias, String donationId) {
        downloadAs(alias, singleReceiptPath(donationId));
    }

    @When("someone without a token downloads the yearly receipt for {int}")
    public void someoneWithoutATokenDownloadsTheYearlyReceipt(int year) {
        api.forgetCredentials();
        api.getBytes(YEARLY_RECEIPT_PATH + year);
    }

    @When("someone without a token downloads the receipt of donation {string}")
    public void someoneWithoutATokenDownloadsTheReceiptOfDonation(String donationId) {
        api.forgetCredentials();
        api.getBytes(singleReceiptPath(donationId));
    }

    @Then("the response is a PDF that must not be cached")
    public void theResponseIsAPdfThatMustNotBeCached() {
        HttpHeaders headers = api.lastResponse().getHeaders();
        assertThat(headers.getContentType()).hasToString("application/pdf");
        assertThat(headers.getContentLength()).isEqualTo(api.lastResponseBytes().length);
        assertThat(headers.getCacheControl()).isEqualTo("private, no-store");
        assertThat(new String(api.lastResponseBytes(), 0, 5, StandardCharsets.US_ASCII)).isEqualTo("%PDF-");
    }

    @Then("the file name is {string}")
    public void theFileNameIs(String fileName) {
        String header = api.lastResponse().getHeaders().getFirst(HttpHeaders.CONTENT_DISPOSITION);
        assertThat(header).withFailMessage("No Content-Disposition in %s", api.lastResponse().getHeaders()).isNotNull();
        ContentDisposition disposition = ContentDisposition.parse(header);
        assertThat(disposition.isAttachment()).isTrue();
        assertThat(disposition.getFilename()).isEqualTo(fileName);
        assertThat(header).contains("filename=\"" + fileName + "\"").contains("filename*=UTF-8''" + fileName);
    }

    @Then("the PDF says {string}")
    public void thePdfSays(String text) {
        assertThat(pdfText()).contains(scenarioDonors.resolve(text));
    }

    @Then("the PDF does not say {string}")
    public void thePdfDoesNotSay(String text) {
        assertThat(pdfText()).doesNotContain(scenarioDonors.resolve(text));
    }

    @Then("the PDF lists {string} before {string}")
    public void thePdfListsBefore(String first, String second) {
        String text = pdfText();
        assertThat(text).contains(first, second);
        assertThat(text.indexOf(first)).withFailMessage("\"%s\" does not come before \"%s\" in %s", first, second, text)
                .isLessThan(text.indexOf(second));
    }

    @Then("the bytes equal the previous download")
    public void theBytesEqualThePreviousDownload() {
        assertThat(downloads).withFailMessage("Fewer than two receipts were downloaded").hasSizeGreaterThanOrEqualTo(2);
        assertThat(downloads.getLast()).isEqualTo(downloads.get(downloads.size() - 2));
    }

    @Then("{int} receipt(s) is/are stored")
    public void receiptsAreStored(int count) {
        assertThat(jdbc.sql("select count(*) from donation_receipt").query(Long.class).single()).isEqualTo(count);
    }

    @Then("receipt {string} is kept as its template and data")
    public void receiptIsKeptAsTemplateAndData(String number) {
        Map<String, Object> row = jdbc.sql("select template_sha256, data, logo_sha256, render_profile, pdf_sha256"
                + " from donation_receipt where number = ?").param(number).query().singleRow();
        assertThat(row.get("template_sha256")).isNotNull();
        assertThat((String) row.get("data")).contains("\"number\":\"" + number + "\"").doesNotContain("data:image");
        assertThat(row.get("logo_sha256")).isNotNull();
        assertThat(((Number) row.get("render_profile")).intValue()).isEqualTo(1);
        assertThat(row.get("pdf_sha256")).isEqualTo(sha256(downloads.getLast()));
    }

    @Then("{int} receipt(s) is/are active")
    public void receiptsAreActive(int count) {
        assertThat(jdbc.sql("select count(*) from donation_receipt where superseded_at is null").query(Long.class).single()).isEqualTo(count);
    }

    @Then("receipt {string} is superseded")
    public void receiptIsSuperseded(String number) {
        assertThat(jdbc.sql("select superseded_at is not null from donation_receipt where number = ?").param(number).query(Boolean.class).single())
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

    private static String sha256(byte[] bytes) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    private void downloadAs(String alias, String path) {
        sessions.actAs(alias);
        ResponseEntity<byte[]> response = api.getBytes(path);
        if (response.getStatusCode().is2xxSuccessful()) {
            downloads.add(api.lastResponseBytes());
        }
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

    private String pdfText() {
        try (PDDocument document = Loader.loadPDF(api.lastResponseBytes())) {
            return new PDFTextStripper().getText(document).replace(NO_BREAK_SPACE, " ").replaceAll("\\s+", " ");
        } catch (IOException e) {
            throw new AssertionError("The response is not a readable PDF", e);
        }
    }

    private static String singleReceiptPath(String donationId) {
        return DONATIONS_PATH + "/" + donationId + "/receipt";
    }
}

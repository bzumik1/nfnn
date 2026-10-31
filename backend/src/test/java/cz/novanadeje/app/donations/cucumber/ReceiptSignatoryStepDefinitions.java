package cz.novanadeje.app.donations.cucumber;

import cz.novanadeje.app.cucumber.ApiClient;
import cz.novanadeje.app.cucumber.DonorSessions;
import cz.novanadeje.app.support.MutableClock;
import cz.novanadeje.app.support.ReceiptSignatories;
import io.cucumber.java.en.Given;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;
import org.springframework.jdbc.core.simple.JdbcClient;
import tools.jackson.databind.JsonNode;

import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

public class ReceiptSignatoryStepDefinitions {

    private static final String SIGNATORY = "/api/admin/donations/receipt-signatory";
    private static final String UNKNOWN_PERSON = "0199f3e0-0000-7000-8000-000000000000";

    private final ApiClient api;
    private final DonorSessions sessions;
    private final JdbcClient jdbc;
    private final MutableClock clock;
    private Optional<UUID> personWithALineBreak = Optional.empty();

    public ReceiptSignatoryStepDefinitions(ApiClient api, DonorSessions sessions, JdbcClient jdbc, MutableClock clock) {
        this.api = api;
        this.sessions = sessions;
        this.jdbc = jdbc;
        this.clock = clock;
    }

    @Given("a person of the foundation signs the receipts")
    public void aPersonOfTheFoundationSignsTheReceipts() {
        ReceiptSignatories.chooseAfterEmptyTables(jdbc, clock.instant());
    }

    @Given("{string} signs the receipts as {string}")
    public void signsTheReceiptsAs(String name, String receiptRole) {
        UUID person = personIdOf(name).orElseGet(UUID::randomUUID);
        ReceiptSignatories.choose(jdbc, person, name, receiptRole, clock.instant());
    }

    @Given("no person of the foundation signs the receipts")
    public void noPersonOfTheFoundationSignsTheReceipts() {
        jdbc.sql("delete from donation_receipt_signatory").update();
    }

    @Given("the stored name of {string} holds a line break")
    public void theStoredNameHoldsALineBreak(String name) {
        UUID person = personIdOf(name).orElseThrow(() -> new AssertionError("No person " + name));
        jdbc.sql("update content_person set name = replace(name, ' ', chr(10)) where id = ?").param(person).update();
        personWithALineBreak = Optional.of(person);
    }

    @When("{string} chooses the person whose stored name holds a line break to sign the receipts as {string}")
    public void choosesThePersonWithALineBreak(String alias, String receiptRole) {
        sessions.actAs(alias);
        api.put(SIGNATORY, body(personWithALineBreak.orElseThrow().toString(), receiptRole));
    }

    @When("the stored name of that person is corrected to {string}")
    public void theStoredNameIsCorrectedTo(String name) {
        jdbc.sql("update content_person set name = ? where id = ?").param(name).param(personWithALineBreak.orElseThrow()).update();
    }

    @When("{string} asks for the receipt signatory")
    public void asksForTheReceiptSignatory(String alias) {
        sessions.actAs(alias);
        api.get(SIGNATORY);
    }

    @When("someone without a token asks for the receipt signatory")
    public void someoneWithoutATokenAsksForTheReceiptSignatory() {
        api.forgetCredentials();
        api.get(SIGNATORY);
    }

    @When("{string} chooses {string} to sign the receipts as {string}")
    public void choosesToSignTheReceiptsAs(String alias, String name, String receiptRole) {
        sessions.actAs(alias);
        api.put(SIGNATORY, body(personIdOf(name).orElseThrow(() -> new AssertionError("No person " + name)).toString(), receiptRole));
    }

    @When("{string} chooses {string} to sign the receipts as a role with a line break")
    public void choosesToSignTheReceiptsAsARoleWithALineBreak(String alias, String name) {
        choosesToSignTheReceiptsAs(alias, name, "předseda\nsprávní rady");
    }

    @When("{string} chooses a person who does not exist to sign the receipts")
    public void choosesAPersonWhoDoesNotExist(String alias) {
        sessions.actAs(alias);
        api.put(SIGNATORY, body(UNKNOWN_PERSON, "předseda"));
    }

    @When("{string} chooses the person {string} to sign the receipts as {string}")
    public void choosesThePersonIdToSignTheReceiptsAs(String alias, String personId, String receiptRole) {
        sessions.actAs(alias);
        api.put(SIGNATORY, body(personId, receiptRole));
    }

    @When("someone without a token chooses {string} to sign the receipts as {string}")
    public void someoneWithoutATokenChooses(String name, String receiptRole) {
        api.forgetCredentials();
        api.put(SIGNATORY, body(personIdOf(name).map(UUID::toString).orElse(UNKNOWN_PERSON), receiptRole));
    }

    @Then("no receipt signatory is chosen")
    public void noReceiptSignatoryIsChosen() {
        assertThat(api.lastResponseJson().get("signatory").isNull()).isTrue();
    }

    @Then("the receipt signatory is {string} as {string}, with a portrait {word} and a signature {word}")
    public void theReceiptSignatoryIs(String name, String receiptRole, String portrait, String signature) {
        JsonNode response = api.lastResponseJson();
        JsonNode chosen = response.has("signatory") ? response.get("signatory") : response;
        assertThat(chosen.get("personId").asString()).isEqualTo(personIdOf(name).orElseThrow().toString());
        assertThat(chosen.get("name").asString()).isEqualTo(name);
        assertThat(chosen.get("receiptRole").asString()).isEqualTo(receiptRole);
        assertThat(chosen.get("portrait").asBoolean()).isEqualTo(yes(portrait));
        assertThat(chosen.get("portraitPrintable").asBoolean()).isEqualTo(yes(portrait));
        assertThat(chosen.get("signature").asBoolean()).isEqualTo(yes(signature));
        assertThat(chosen.get("chosenAt").asString()).isNotBlank();
    }

    @Then("the receipt signatory has a portrait that cannot be printed")
    public void theReceiptSignatoryHasAPortraitThatCannotBePrinted() {
        JsonNode chosen = api.lastResponseJson().get("signatory");
        assertThat(chosen.get("portrait").asBoolean()).isTrue();
        assertThat(chosen.get("portraitPrintable").asBoolean()).isFalse();
    }

    @Then("the receipt signatures list a {word} signature of {string}, {int} by {int} pixels")
    public void theReceiptSignaturesList(String kind, String name, int width, int height) {
        String person = personIdOf(name).orElseThrow().toString();
        JsonNode listed = null;
        for (JsonNode signature : api.lastResponseJson().get("signatures")) {
            if (signature.get("personId").asString().equals(person)) {
                listed = signature;
            }
        }
        assertThat(listed).withFailMessage("No signature of %s in %s", name, api.lastResponse().getBody()).isNotNull();
        assertThat(listed.get("kind").asString()).isEqualTo(kind);
        assertThat(listed.get("width").asInt()).isEqualTo(width);
        assertThat(listed.get("height").asInt()).isEqualTo(height);
    }

    @Then("the receipt signatures list none")
    public void theReceiptSignaturesListNone() {
        assertThat(api.lastResponseJson().get("signatures")).isEmpty();
    }

    @Then("no receipt signature is kept for a person the foundation no longer has")
    public void noReceiptSignatureIsKeptForARemovedPerson() {
        assertThat(jdbc.sql("select count(*) from donation_person_receipt_signature s"
                + " where not exists (select 1 from content_person p where p.id = s.person_id)").query(Long.class).single()).isZero();
    }

    private Optional<UUID> personIdOf(String name) {
        return jdbc.sql("select id from content_person where name = ?").param(name).query(UUID.class).optional();
    }

    private static boolean yes(String word) {
        return switch (word) {
            case "set" -> true;
            case "missing" -> false;
            default -> throw new IllegalArgumentException("Expected set or missing, not " + word);
        };
    }

    private static Map<String, Object> body(String personId, String receiptRole) {
        Map<String, Object> body = new HashMap<>();
        body.put("personId", personId);
        body.put("receiptRole", receiptRole);
        return body;
    }
}

package cz.novanadeje.app.donations.cucumber;

import cz.novanadeje.app.cucumber.ApiClient;
import cz.novanadeje.app.cucumber.ScenarioDonors;
import cz.novanadeje.app.donations.domain.donor.DonorRecord;
import cz.novanadeje.app.donations.domain.donor.DonorRecordRepository;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.shared.application.event.DonorRegistered;
import cz.novanadeje.app.shared.domain.DonorType;
import cz.novanadeje.app.shared.domain.EmailAddress;
import cz.novanadeje.app.shared.domain.LocaleCode;
import cz.novanadeje.app.shared.domain.PostalAddress;
import cz.novanadeje.app.shared.domain.UuidV7;
import cz.novanadeje.app.shared.domain.VariableSymbol;
import io.cucumber.java.en.Given;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.JsonNode;

import java.time.Clock;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

public class DonorRecordStepDefinitions {

    private static final String REGISTER_PATH = "/api/donors/auth/register";
    private static final String PROFILE_PATH = "/api/donors/me";
    private static final String PASSWORD = "correct horse battery";
    private static final PostalAddress PERSON_ADDRESS = new PostalAddress("Dlouhá 12", "Ústí nad Labem", "400 01");
    private static final PostalAddress COMPANY_ADDRESS = new PostalAddress("Průmyslová 5", "Teplice", "415 01");
    private static final Map<String, String> PERSON_NAMES = Map.of("Jana", "Jana Nováková", "Petr", "Petr Svoboda");
    private static final Map<String, String> COMPANY_NAMES = Map.of("Stavby", "Stavby Novák s.r.o.");

    private final ApiClient api;
    private final ScenarioDonors scenarioDonors;
    private final DonorRecordRepository donorRecords;
    private final ApplicationEventPublisher events;
    private final TransactionTemplate transaction;
    private final JdbcClient jdbc;
    private final Clock clock;
    private final Map<String, PostalAddress> addresses = new HashMap<>();

    public DonorRecordStepDefinitions(ApiClient api, ScenarioDonors scenarioDonors, DonorRecordRepository donorRecords,
                                      ApplicationEventPublisher events, TransactionTemplate transaction, JdbcClient jdbc, Clock clock) {
        this.api = api;
        this.scenarioDonors = scenarioDonors;
        this.donorRecords = donorRecords;
        this.events = events;
        this.transaction = transaction;
        this.jdbc = jdbc;
        this.clock = clock;
    }

    @Given("a person {string} is registered")
    public void aPersonIsRegistered(String alias) {
        register(alias, DonorType.PERSON, personName(alias), null, PERSON_ADDRESS);
    }

    @Given("a company {string} is registered with identification number {string}")
    public void aCompanyIsRegisteredWithIdentificationNumber(String alias, String companyIdentifier) {
        register(alias, DonorType.COMPANY, COMPANY_NAMES.getOrDefault(alias, alias + " s.r.o."), companyIdentifier, COMPANY_ADDRESS);
    }

    @Given("donations is told that a person {string} registered with variable symbol {string}")
    public void donationsIsToldThatAPersonRegisteredWithVariableSymbol(String alias, String variableSymbol) {
        UUID donorId = scenarioDonors.findIdOf(alias).orElseGet(() -> UuidV7.generate(clock.instant()));
        VariableSymbol symbol = new VariableSymbol(variableSymbol);
        DonorRegistered event = new DonorRegistered(donorId, DonorType.PERSON, personName(alias), Optional.empty(), PERSON_ADDRESS,
                new EmailAddress(email(alias)), symbol, LocaleCode.CS, clock.instant());
        transaction.executeWithoutResult(status -> events.publishEvent(event));
        scenarioDonors.remember(alias, donorId, symbol);
        addresses.put(alias, PERSON_ADDRESS);
    }

    @When("{string} updates the profile to name {string} and street {string}")
    public void updatesTheProfileToNameAndStreet(String alias, String name, String street) {
        PostalAddress current = addresses.get(alias);
        Map<String, Object> body = new HashMap<>();
        body.put("name", name);
        body.put("address", Map.of("street", street, "city", current.city(), "postalCode", current.postalCode()));
        patchProfileOf(alias, body);
        addresses.put(alias, new PostalAddress(street, current.city(), current.postalCode()));
    }

    @When("{string} switches the preferred locale to {string}")
    public void switchesThePreferredLocaleTo(String alias, String locale) {
        patchProfileOf(alias, Map.of("preferredLocale", locale));
    }

    @Then("donations knows {string} with type {string}, name {string}, address {string} and locale {string}")
    public void donationsKnowsWithTypeNameAddressAndLocale(String alias, String type, String name, String address, String locale) {
        DonorRecord record = recordOf(alias);
        assertThat(record.type()).isEqualTo(DonorType.valueOf(type));
        assertThat(record.name()).isEqualTo(name);
        assertThat(record.address().singleLine()).isEqualTo(address);
        assertThat(record.preferredLocale()).isEqualTo(LocaleCode.fromTag(locale));
    }

    @Then("donations knows {string} with the registered variable symbol")
    public void donationsKnowsWithTheRegisteredVariableSymbol(String alias) {
        assertThat(recordOf(alias).variableSymbol()).isEqualTo(scenarioDonors.variableSymbolOf(alias));
    }

    @Then("donations knows {string} with company identifier {string}")
    public void donationsKnowsWithCompanyIdentifier(String alias, String companyIdentifier) {
        assertThat(recordOf(alias).companyIdentifier()).contains(companyIdentifier);
    }

    @Then("donations keeps {int} donor record(s)")
    public void donationsKeepsDonorRecords(int count) {
        assertThat(jdbc.sql("select count(*) from donor_record").query(Long.class).single()).isEqualTo(count);
    }

    private void register(String alias, DonorType type, String name, String companyIdentifier, PostalAddress address) {
        api.forgetCredentials();
        Map<String, Object> body = new HashMap<>();
        body.put("type", type.name());
        body.put("name", name);
        body.put("companyIdentifier", companyIdentifier);
        body.put("address", Map.of("street", address.street(), "city", address.city(), "postalCode", address.postalCode()));
        body.put("email", email(alias));
        body.put("password", PASSWORD);
        ResponseEntity<String> response = api.post(REGISTER_PATH, body);
        assertThat(response.getStatusCode().value()).withFailMessage("Registration answered %s", response.getBody()).isEqualTo(201);
        JsonNode json = api.lastResponseJson();
        JsonNode user = json.get("user");
        scenarioDonors.remember(alias, UUID.fromString(user.get("id").asString()), new VariableSymbol(user.get("variableSymbol").asString()));
        scenarioDonors.rememberAccessToken(alias, json.get("accessToken").asString());
        addresses.put(alias, address);
    }

    private void patchProfileOf(String alias, Map<String, ?> body) {
        api.authorize(scenarioDonors.accessTokenOf(alias));
        ResponseEntity<String> response = api.patch(PROFILE_PATH, body);
        assertThat(response.getStatusCode().value()).withFailMessage("Profile update answered %s", response.getBody()).isEqualTo(200);
    }

    private DonorRecord recordOf(String alias) {
        return donorRecords.findById(new DonorReference(scenarioDonors.idOf(alias)))
                .orElseThrow(() -> new AssertionError("Donations has no record of \"" + alias + "\""));
    }

    private static String personName(String alias) {
        return PERSON_NAMES.getOrDefault(alias, alias + " Nováková");
    }

    private static String email(String alias) {
        return alias.toLowerCase(Locale.ROOT) + "@example.cz";
    }
}

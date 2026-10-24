package cz.novanadeje.app.donors.cucumber;

import cz.novanadeje.app.cucumber.ApiClient;
import cz.novanadeje.app.donors.domain.CompanyIdentifier;
import cz.novanadeje.app.donors.domain.RegisteredCompany;
import cz.novanadeje.app.shared.domain.PostalAddress;
import cz.novanadeje.app.support.FakeCompanyRegistry;
import io.cucumber.java.en.Given;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;
import tools.jackson.databind.JsonNode;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;

public class CompanyLookupStepDefinitions {

    private static final String LOOKUP_PATH = "/api/donors/company-lookup";

    private final ApiClient api;
    private final FakeCompanyRegistry registry;

    public CompanyLookupStepDefinitions(ApiClient api, FakeCompanyRegistry registry) {
        this.api = api;
        this.registry = registry;
    }

    @Given("the business register knows the company {string} named {string} seated at {string}, {string} {string}")
    public void theRegisterKnowsTheCompany(String identifier, String name, String street, String postalCode, String city) {
        registry.know(new RegisteredCompany(new CompanyIdentifier(identifier), name, Optional.of(new PostalAddress(street, city, postalCode))));
    }

    @Given("the business register knows the company {string} named {string} without a seat")
    public void theRegisterKnowsTheCompanyWithoutSeat(String identifier, String name) {
        registry.know(new RegisteredCompany(new CompanyIdentifier(identifier), name, Optional.empty()));
    }

    @Given("the business register is down")
    public void theRegisterIsDown() {
        registry.goDown();
    }

    @When("the business register is up again")
    public void theRegisterIsUpAgain() {
        registry.comeBack();
    }

    @When("a visitor looks up the company {string}")
    public void aVisitorLooksUpTheCompany(String identifier) {
        lookUp(identifier);
    }

    @Given("a visitor looked up the company {string} {int} times")
    public void aVisitorLookedUpTheCompanyTimes(String identifier, int times) {
        for (int i = 0; i < times; i++) {
            lookUp(identifier);
        }
    }

    @Then("the looked-up company is {string} named {string} seated at {string}, {string} {string}")
    public void theLookedUpCompanyIs(String identifier, String name, String street, String postalCode, String city) {
        JsonNode company = api.lastResponseJson();
        assertThat(company.get("companyIdentifier").asString()).isEqualTo(identifier);
        assertThat(company.get("name").asString()).isEqualTo(name);
        assertThat(company.get("address").get("street").asString()).isEqualTo(street);
        assertThat(company.get("address").get("postalCode").asString()).isEqualTo(postalCode);
        assertThat(company.get("address").get("city").asString()).isEqualTo(city);
    }

    @Then("the looked-up company is {string} named {string} without an address")
    public void theLookedUpCompanyIsWithoutAddress(String identifier, String name) {
        JsonNode company = api.lastResponseJson();
        assertThat(company.get("companyIdentifier").asString()).isEqualTo(identifier);
        assertThat(company.get("name").asString()).isEqualTo(name);
        assertThat(company.get("address").isNull()).isTrue();
    }

    @Then("the business register was asked {int} time(s)")
    public void theRegisterWasAsked(int times) {
        assertThat(registry.requests()).isEqualTo(times);
    }

    private void lookUp(String identifier) {
        api.get(LOOKUP_PATH + "?companyIdentifier=" + identifier);
    }
}

package cz.novanadeje.app.cucumber;

import io.cucumber.java.en.Given;
import io.cucumber.java.en.Then;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationContext;

import static org.assertj.core.api.Assertions.assertThat;

public class SmokeStepDefinitions {

    @Autowired
    private ApplicationContext applicationContext;

    @Given("the Spring application context has loaded")
    public void theSpringApplicationContextHasLoaded() {
        assertThat(applicationContext).isNotNull();
    }

    @Then("acceptance-test infrastructure is operational")
    public void acceptanceTestInfrastructureIsOperational() {
        assertThat(applicationContext.getEnvironment()).isNotNull();
    }
}

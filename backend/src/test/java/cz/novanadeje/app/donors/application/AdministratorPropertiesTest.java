package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.shared.domain.EmailAddress;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Configuration;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

class AdministratorPropertiesTest {

    private final ApplicationContextRunner contexts = new ApplicationContextRunner()
            .withInitializer(new ConfigDataApplicationContextInitializer())
            .withUserConfiguration(Support.class);

    @Test
    @DisplayName("Given only application.yml without ADMIN_EMAILS, when the context starts, then no administrator is configured")
    void should_configure_nobody_when_started_given_defaults() {
        contexts.run(context -> {
            assertThat(context).hasNotFailed();
            assertThat(context.getBean(AdministratorProperties.class).addresses()).isEmpty();
        });
    }

    @Test
    @DisplayName("Given ADMIN_EMAILS with two addresses and spaces, when the context starts, then both addresses are configured")
    void should_configure_both_when_started_given_two_addresses() {
        contexts.withSystemProperties("ADMIN_EMAILS=jakub@example.cz, pavel@example.cz").run(context -> {
            assertThat(context).hasNotFailed();
            assertThat(context.getBean(AdministratorProperties.class).addresses())
                    .containsExactly(new EmailAddress("jakub@example.cz"), new EmailAddress("pavel@example.cz"));
        });
    }

    @Test
    @DisplayName("Given a value that is not an e-mail address, when the properties are made, then the startup fails")
    void should_fail_when_made_given_invalid_address() {
        assertThatIllegalArgumentException()
                .isThrownBy(() -> new AdministratorProperties(List.of("jakub@example.cz", "not-an-address")))
                .withMessageContaining("app.donors.administrators.emails");
    }

    @Test
    @DisplayName("Given a null list, when the properties are made, then no administrator is configured")
    void should_configure_nobody_when_made_given_null() {
        assertThat(new AdministratorProperties(null).addresses()).isEmpty();
    }

    @Configuration
    @EnableConfigurationProperties(AdministratorProperties.class)
    static class Support {
    }
}

package cz.novanadeje.app.donations.infrastructure.config;

import cz.novanadeje.app.donations.application.report.ReportDefaults;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import static org.assertj.core.api.Assertions.assertThat;

class ReportDefaultsBindingTest {

    private final ApplicationContextRunner contexts = new ApplicationContextRunner()
            .withInitializer(new ConfigDataApplicationContextInitializer())
            .withUserConfiguration(DonationsApplicationConfiguration.class);

    @Test
    @DisplayName("Given only application.yml, when the context starts, then the report goes by default to the foundation's address")
    void should_default_to_the_foundation_when_started_given_only_application_yml() {
        contexts.run(context -> {
            assertThat(context).hasNotFailed();
            assertThat(context.getBean(ReportDefaults.class).recipient()).isEqualTo("info@nfnn.cz");
        });
    }

    @Test
    @DisplayName("Given a configured recipient, when the context starts, then it is the default recipient")
    void should_use_the_configured_recipient_when_started_given_property() {
        contexts.withPropertyValues("app.donations.report.recipient=pavel@example.cz").run(context -> {
            assertThat(context).hasNotFailed();
            assertThat(context.getBean(ReportDefaults.class).recipient()).isEqualTo("pavel@example.cz");
        });
    }

    @Test
    @DisplayName("Given a recipient that is not an e-mail address, when the context starts, then startup fails naming REPORT_RECIPIENT")
    void should_fail_startup_when_started_given_malformed_recipient() {
        contexts.withPropertyValues("app.donations.report.recipient=foundation").run(context -> {
            assertThat(context).hasFailed();
            assertThat(context.getStartupFailure()).hasStackTraceContaining("REPORT_RECIPIENT");
        });
    }

    @Test
    @DisplayName("Given no configuration at all, when the context starts, then the missing report group still fails naming REPORT_RECIPIENT")
    void should_fail_startup_when_started_given_no_configuration() {
        new ApplicationContextRunner().withUserConfiguration(DonationsApplicationConfiguration.class)
                .withPropertyValues("app.donations.import.overlap=P3D", "app.donations.import.history-window=P89D", "app.donations.import.on-demand-cooldown=PT30S")
                .run(context -> {
                    assertThat(context).hasFailed();
                    assertThat(context.getStartupFailure()).hasStackTraceContaining("REPORT_RECIPIENT");
                });
    }
}

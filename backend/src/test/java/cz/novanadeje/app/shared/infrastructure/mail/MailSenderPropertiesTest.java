package cz.novanadeje.app.shared.infrastructure.mail;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Configuration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

class MailSenderPropertiesTest {

    private final ApplicationContextRunner contexts = new ApplicationContextRunner()
            .withInitializer(new ConfigDataApplicationContextInitializer())
            .withUserConfiguration(Support.class);

    @Test
    @DisplayName("Given only application.yml, when the context starts, then mail is sent from the foundation's address")
    void should_send_from_foundation_address_when_started_given_defaults() {
        contexts.run(context -> {
            assertThat(context).hasNotFailed();
            assertThat(context.getBean(MailSenderProperties.class).senderEmail()).isEqualTo("info@novanadeje.cz");
        });
    }

    @Test
    @DisplayName("Given only the contact recipient, when the context starts, then mail is sent from that address")
    void should_send_from_contact_recipient_when_started_given_no_mail_from() {
        contexts.withPropertyValues("CONTACT_RECIPIENT=office@example.cz").run(context ->
                assertThat(context.getBean(MailSenderProperties.class).senderEmail()).isEqualTo("office@example.cz"));
    }

    @Test
    @DisplayName("Given MAIL_FROM, when the context starts, then mail is sent from it")
    void should_send_from_mail_from_when_started_given_mail_from() {
        contexts.withPropertyValues("CONTACT_RECIPIENT=office@example.cz", "MAIL_FROM=web@example.cz").run(context ->
                assertThat(context.getBean(MailSenderProperties.class).senderEmail()).isEqualTo("web@example.cz"));
    }

    @Test
    @DisplayName("Given an empty MAIL_FROM, when the context starts, then it fails naming the environment variable")
    void should_fail_naming_env_var_when_started_given_empty_mail_from() {
        contexts.withPropertyValues("MAIL_FROM=").run(context -> {
            assertThat(context).hasFailed();
            assertThat(context.getStartupFailure()).rootCause().hasMessageContaining("MAIL_FROM (app.mail.sender-email)");
        });
    }

    @Test
    @DisplayName("Given a sender with spaces around it, when the properties are made, then it is trimmed")
    void should_trim_when_made_given_spaces() {
        assertThat(new MailSenderProperties("  web@example.cz ").senderEmail()).isEqualTo("web@example.cz");
    }

    @Test
    @DisplayName("Given no sender, when the properties are made, then they fail naming the environment variable")
    void should_fail_when_made_given_null() {
        assertThatIllegalArgumentException().isThrownBy(() -> new MailSenderProperties(null))
                .withMessageContaining("MAIL_FROM (app.mail.sender-email)");
    }

    @Configuration(proxyBeanMethods = false)
    @EnableConfigurationProperties(MailSenderProperties.class)
    static class Support {
    }
}

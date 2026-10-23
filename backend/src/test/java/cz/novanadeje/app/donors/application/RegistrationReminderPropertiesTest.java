package cz.novanadeje.app.donors.application;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Configuration;

import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

class RegistrationReminderPropertiesTest {

    private final ApplicationContextRunner contexts = new ApplicationContextRunner()
            .withInitializer(new ConfigDataApplicationContextInitializer())
            .withUserConfiguration(Support.class);

    @Test
    @DisplayName("Given only application.yml, when the context starts, then the reminder runs hourly for registrations one to seven days old")
    void should_remind_hourly_after_a_day_within_a_week_when_started_given_defaults() {
        contexts.run(context -> {
            assertThat(context).hasNotFailed();
            RegistrationReminderProperties properties = context.getBean(RegistrationReminderProperties.class);
            assertThat(properties.cron()).isEqualTo("0 20 * * * *");
            assertThat(properties.delay()).isEqualTo(Duration.ofDays(1));
            assertThat(properties.window()).isEqualTo(Duration.ofDays(7));
        });
    }

    @Test
    @DisplayName("Given a blank cron, when the properties are made, then they fail naming the property")
    void should_fail_naming_cron_when_made_given_blank_cron() {
        assertThatIllegalArgumentException()
                .isThrownBy(() -> new RegistrationReminderProperties(" ", Duration.ofDays(1), Duration.ofDays(7)))
                .withMessageContaining("app.donors.registration-reminder.cron");
    }

    @Test
    @DisplayName("Given a delay that is not positive, when the properties are made, then they fail naming the property")
    void should_fail_naming_delay_when_made_given_zero_delay() {
        assertThatIllegalArgumentException()
                .isThrownBy(() -> new RegistrationReminderProperties("-", Duration.ZERO, Duration.ofDays(7)))
                .withMessageContaining("app.donors.registration-reminder.delay");
    }

    @Test
    @DisplayName("Given a window no longer than the delay, when the properties are made, then they fail naming the property")
    void should_fail_naming_window_when_made_given_window_not_longer_than_delay() {
        assertThatIllegalArgumentException()
                .isThrownBy(() -> new RegistrationReminderProperties("-", Duration.ofDays(1), Duration.ofDays(1)))
                .withMessageContaining("app.donors.registration-reminder.window");
    }

    @Configuration(proxyBeanMethods = false)
    @EnableConfigurationProperties(RegistrationReminderProperties.class)
    static class Support {
    }
}

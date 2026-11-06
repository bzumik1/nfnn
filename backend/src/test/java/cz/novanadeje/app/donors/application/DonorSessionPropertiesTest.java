package cz.novanadeje.app.donors.application;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Configuration;

import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

class DonorSessionPropertiesTest {

    private final ApplicationContextRunner contexts = new ApplicationContextRunner()
            .withInitializer(new ConfigDataApplicationContextInitializer())
            .withUserConfiguration(Support.class);

    @Test
    @DisplayName("Given only application.yml, when the context starts, then a remembered sign-in lasts 14 days")
    void should_remember_fourteen_days_when_started_given_defaults() {
        contexts.run(context -> {
            assertThat(context).hasNotFailed();
            assertThat(context.getBean(DonorSessionProperties.class).lengths().rememberedDays()).isEqualTo(14);
        });
    }

    @Test
    @DisplayName("Given SESSION_REMEMBER_DAYS of 30, when the context starts, then a remembered sign-in lasts 30 days")
    void should_remember_thirty_days_when_started_given_setting() {
        contexts.withPropertyValues("SESSION_REMEMBER_DAYS=30").run(context -> {
            assertThat(context).hasNotFailed();
            assertThat(context.getBean(DonorSessionProperties.class).lengths().rememberedDays()).isEqualTo(30);
        });
    }

    @ParameterizedTest
    @ValueSource(ints = {0, 31})
    @DisplayName("Given a remembered length outside 1 to 30 days, when the properties are made, then they fail naming the setting")
    void should_fail_naming_setting_when_made_given_days_out_of_range(int days) {
        assertThatIllegalArgumentException()
                .isThrownBy(() -> new DonorSessionProperties(Duration.ofDays(14), days))
                .withMessageContaining("SESSION_REMEMBER_DAYS");
    }

    @Test
    @DisplayName("Given no remembered length, when the properties are made, then a remembered sign-in lasts 14 days")
    void should_remember_fourteen_days_when_made_given_no_length() {
        assertThat(new DonorSessionProperties(Duration.ofDays(14), null).rememberDays()).isEqualTo(14);
    }

    @Configuration(proxyBeanMethods = false)
    @EnableConfigurationProperties(DonorSessionProperties.class)
    static class Support {
    }
}

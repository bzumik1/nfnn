package cz.novanadeje.app.operations.infrastructure.loggers;

import cz.novanadeje.app.operations.domain.loggers.LogLevel;
import cz.novanadeje.app.operations.domain.loggers.ProtectedLoggers;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.config.YamlPropertiesFactoryBean;
import org.springframework.core.io.ClassPathResource;

import java.util.Properties;

import static org.assertj.core.api.Assertions.assertThat;

class ProtectedLoggerPinsTest {

    @Test
    @DisplayName("Given the configuration, when a protected logger is looked up, then it has its own level of INFO or quieter so a raised parent never reaches it")
    void should_pin_every_protected_logger_when_configured_given_application_yml() {
        YamlPropertiesFactoryBean yaml = new YamlPropertiesFactoryBean();
        yaml.setResources(new ClassPathResource("application.yml"));
        Properties properties = yaml.getObject();

        ProtectedLoggers.PINS.forEach((name, pin) -> {
            String configured = properties.getProperty("logging.level." + name);
            assertThat(configured).as(name).isNotNull();
            assertThat(LogLevel.valueOf(configured)).as(name).isGreaterThanOrEqualTo(pin);
        });
    }
}

package cz.novanadeje.app.operations.infrastructure.loggers;

import cz.novanadeje.app.operations.domain.loggers.ProtectedLoggers;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.config.YamlPropertiesFactoryBean;
import org.springframework.core.io.ClassPathResource;

import java.util.Properties;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

class ProtectedLoggerPinsTest {

    @Test
    @DisplayName("Given the configuration, when a protected logger is looked up, then it has its own level of INFO or quieter so a raised parent never reaches it")
    void should_pin_every_protected_logger_when_configured_given_application_yml() {
        YamlPropertiesFactoryBean yaml = new YamlPropertiesFactoryBean();
        yaml.setResources(new ClassPathResource("application.yml"));
        Properties properties = yaml.getObject();

        for (String name : ProtectedLoggers.NAMES) {
            assertThat(properties.getProperty("logging.level." + name)).as(name).isIn(Set.of("INFO", "WARN", "ERROR", "OFF"));
        }
    }
}

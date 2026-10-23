package cz.novanadeje.app.shared.infrastructure.mail;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.config.YamlPropertiesFactoryBean;
import org.springframework.core.io.ClassPathResource;

import java.util.Properties;

import static org.assertj.core.api.Assertions.assertThat;

class MailTransportConfigurationTest {

    @Test
    @DisplayName("Given the configuration, when the mail transport is read, then STARTTLS is required whenever it is on and every wait has a timeout")
    void should_require_starttls_and_time_out_when_configured_given_application_yml() {
        YamlPropertiesFactoryBean yaml = new YamlPropertiesFactoryBean();
        yaml.setResources(new ClassPathResource("application.yml"));
        Properties properties = yaml.getObject();
        String smtp = "spring.mail.properties.mail.smtp.";

        assertThat(properties.getProperty(smtp + "starttls.required")).isEqualTo(properties.getProperty(smtp + "starttls.enable"));
        assertThat(properties.getProperty(smtp + "connectiontimeout")).isEqualTo("10000");
        assertThat(properties.getProperty(smtp + "timeout")).isEqualTo("10000");
        assertThat(properties.getProperty(smtp + "writetimeout")).isEqualTo("10000");
    }
}

package cz.novanadeje.app.donations.infrastructure.config;

import cz.novanadeje.app.donations.application.importing.BankImportProperties;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(DonationsApplicationProperties.class)
public class DonationsApplicationConfiguration {

    @Bean
    BankImportProperties bankImportProperties(DonationsApplicationProperties properties) {
        return properties.bankImport();
    }
}

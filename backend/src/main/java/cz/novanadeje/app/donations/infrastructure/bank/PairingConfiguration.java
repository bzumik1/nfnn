package cz.novanadeje.app.donations.infrastructure.bank;

import cz.novanadeje.app.donations.domain.donor.ExcludedSenderAccounts;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
class PairingConfiguration {

    @Bean
    ExcludedSenderAccounts excludedSenderAccounts(PairingProperties properties) {
        return properties.toExcludedSenderAccounts();
    }
}

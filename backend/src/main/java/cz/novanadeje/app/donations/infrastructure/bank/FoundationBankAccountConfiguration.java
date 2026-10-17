package cz.novanadeje.app.donations.infrastructure.bank;

import cz.novanadeje.app.donations.domain.BankAccount;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
class FoundationBankAccountConfiguration {

    @Bean
    BankAccount foundationBankAccount(FoundationBankAccountProperties properties) {
        return properties.toBankAccount();
    }
}

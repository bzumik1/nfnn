package cz.novanadeje.app.donations.infrastructure.bank;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;

import static org.assertj.core.api.Assertions.assertThat;

class FoundationBankAccountPropertiesTest {

    private final ApplicationContextRunner context = new ApplicationContextRunner()
            .withUserConfiguration(BankAccountOnly.class)
            .withPropertyValues("app.donations.bank-account.recipient-name=Nadační fond Nová naděje");

    @Test
    @DisplayName("Given the account number and the IBAN of one account, when the backend starts, then it holds the foundation's account")
    void should_start_when_started_given_the_number_and_the_iban_of_one_account() {
        context.withPropertyValues("app.donations.bank-account.account-number=5544332217/2010", "app.donations.bank-account.iban=CZ2620100000005544332217")
                .run(started -> assertThat(started).hasNotFailed().hasBean("foundationBankAccount"));
    }

    @Test
    @DisplayName("Given an IBAN of another account than the account number, when the backend starts, then it stops before the page could show one account and the QR pay another")
    void should_refuse_to_start_when_started_given_an_iban_of_another_account() {
        context.withPropertyValues("app.donations.bank-account.account-number=5544332217/2010", "app.donations.bank-account.iban=CZ6508000000192000145399")
                .run(started -> assertThat(started).hasFailed()
                        .getFailure().rootCause().isInstanceOf(IllegalArgumentException.class).hasMessageContaining("CZ6508000000192000145399"));
    }

    @Configuration(proxyBeanMethods = false)
    @EnableConfigurationProperties(FoundationBankAccountProperties.class)
    @Import(FoundationBankAccountConfiguration.class)
    static class BankAccountOnly {
    }
}

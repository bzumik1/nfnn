package cz.novanadeje.app.donations.infrastructure.receipt;

import cz.novanadeje.app.donations.domain.BankAccount;
import cz.novanadeje.app.donations.domain.receipt.FirstReceiptYear;
import cz.novanadeje.app.donations.domain.receipt.FoundationIdentity;
import cz.novanadeje.app.donations.domain.receipt.Signatory;
import cz.novanadeje.app.shared.domain.PostalAddress;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
class ReceiptConfiguration {

    @Bean
    FoundationIdentity foundationIdentity(ReceiptProperties properties, BankAccount foundationBankAccount) {
        return new FoundationIdentity(properties.foundationName(), properties.foundationCompanyIdentifier(),
                new PostalAddress(properties.foundationStreet(), properties.foundationCity(), properties.foundationPostalCode()),
                properties.registryCourt(), properties.registryFile(), foundationBankAccount.accountNumber(), properties.issuePlace(),
                properties.issuePlaceEn());
    }

    @Bean
    Signatory receiptSignatory(ReceiptProperties properties) {
        return new Signatory(properties.signatoryName(), properties.signatoryRole());
    }

    @Bean
    FirstReceiptYear firstReceiptYear(ReceiptProperties properties) {
        return new FirstReceiptYear(properties.firstReceiptYear());
    }
}

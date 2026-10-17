package cz.novanadeje.app.donations.infrastructure.bank;

import cz.novanadeje.app.donations.domain.BankAccount;
import cz.novanadeje.app.shared.domain.Iban;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("app.donations.bank-account")
public record FoundationBankAccountProperties(String accountNumber, String iban, String recipientName) {

    BankAccount toBankAccount() {
        return new BankAccount(accountNumber, new Iban(iban), recipientName);
    }
}

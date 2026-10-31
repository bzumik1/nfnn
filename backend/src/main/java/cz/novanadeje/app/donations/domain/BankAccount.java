package cz.novanadeje.app.donations.domain;

import cz.novanadeje.app.shared.domain.Iban;

public record BankAccount(String accountNumber, Iban iban, String recipientName) {

    public BankAccount {
        CzechAccountNumber number = new CzechAccountNumber(accountNumber);
        if (iban == null) {
            throw new IllegalArgumentException("IBAN is required");
        }
        if (!number.toIban().equals(iban)) {
            throw new IllegalArgumentException("IBAN " + iban + " is not the IBAN of account " + number + ", which is " + number.toIban());
        }
        if (recipientName == null || recipientName.isBlank()) {
            throw new IllegalArgumentException("Recipient name is required");
        }
        accountNumber = number.value();
        recipientName = recipientName.trim();
    }
}

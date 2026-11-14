package cz.novanadeje.app.donations.domain;

public record BankAccount(String accountNumber, Iban iban, String recipientName) {

    public BankAccount {
        CzechAccountNumber number = new CzechAccountNumber(accountNumber);
        if (iban == null) {
            throw new IllegalArgumentException("IBAN is required");
        }
        if (!number.toIban().equals(iban)) {
            throw new IllegalArgumentException("IBAN is not the IBAN of the account number");
        }
        if (recipientName == null || recipientName.isBlank()) {
            throw new IllegalArgumentException("Recipient name is required");
        }
        accountNumber = number.value();
        recipientName = recipientName.trim();
    }
}

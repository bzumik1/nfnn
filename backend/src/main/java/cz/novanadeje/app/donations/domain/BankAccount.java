package cz.novanadeje.app.donations.domain;

import cz.novanadeje.app.shared.domain.Iban;

import java.util.regex.Pattern;

public record BankAccount(String accountNumber, Iban iban, String recipientName) {

    private static final Pattern CZECH_ACCOUNT_NUMBER = Pattern.compile("([0-9]{1,6}-)?[0-9]{1,10}/[0-9]{4}");

    public BankAccount {
        if (accountNumber == null || !CZECH_ACCOUNT_NUMBER.matcher(accountNumber.trim()).matches()) {
            throw new IllegalArgumentException("Account number must look like [prefix-]number/bank code: " + accountNumber);
        }
        if (iban == null) {
            throw new IllegalArgumentException("IBAN is required");
        }
        if (recipientName == null || recipientName.isBlank()) {
            throw new IllegalArgumentException("Recipient name is required");
        }
        accountNumber = accountNumber.trim();
        recipientName = recipientName.trim();
    }
}

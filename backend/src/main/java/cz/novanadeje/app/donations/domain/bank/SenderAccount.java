package cz.novanadeje.app.donations.domain.bank;

import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public record SenderAccount(String accountNumber, String bankCode) {

    public static final int MAX_PREFIX_LENGTH = 6;
    public static final int MAX_NUMBER_LENGTH = 10;
    public static final int MAX_ACCOUNT_NUMBER_LENGTH = MAX_PREFIX_LENGTH + 1 + MAX_NUMBER_LENGTH;
    public static final int BANK_CODE_LENGTH = 4;

    private static final Pattern CANONICAL_ACCOUNT = Pattern.compile("([1-9][0-9]{0,5}-)?[1-9][0-9]{0,9}");
    private static final Pattern RAW_ACCOUNT = Pattern.compile("(?:([0-9]{1,6})-)?([0-9]{1,10})");
    private static final Pattern BANK_CODE = Pattern.compile("[0-9]{4}");
    private static final Pattern WHITESPACE = Pattern.compile("\\s+");

    public SenderAccount {
        if (accountNumber == null || !CANONICAL_ACCOUNT.matcher(accountNumber).matches()) {
            throw new IllegalArgumentException("Sender account number is not canonical: " + accountNumber);
        }
        if (bankCode == null || !BANK_CODE.matcher(bankCode).matches()) {
            throw new IllegalArgumentException("Sender bank code must be four digits: " + bankCode);
        }
    }

    public static Optional<SenderAccount> parse(String rawAccount, String rawBankCode) {
        if (rawAccount == null || rawAccount.isBlank() || rawBankCode == null || rawBankCode.isBlank()) {
            return Optional.empty();
        }
        String bankCode = withoutWhitespace(rawBankCode);
        Matcher account = RAW_ACCOUNT.matcher(withoutWhitespace(rawAccount));
        if (!BANK_CODE.matcher(bankCode).matches() || !account.matches()) {
            return Optional.empty();
        }
        String number = withoutLeadingZeros(account.group(2));
        if (number.isEmpty()) {
            return Optional.empty();
        }
        String prefix = account.group(1) == null ? "" : withoutLeadingZeros(account.group(1));
        return Optional.of(new SenderAccount(prefix.isEmpty() ? number : prefix + "-" + number, bankCode));
    }

    public String display() {
        return accountNumber + "/" + bankCode;
    }

    private static String withoutWhitespace(String value) {
        return WHITESPACE.matcher(value).replaceAll("");
    }

    private static String withoutLeadingZeros(String digits) {
        int first = 0;
        while (first < digits.length() && digits.charAt(first) == '0') {
            first++;
        }
        return digits.substring(first);
    }
}

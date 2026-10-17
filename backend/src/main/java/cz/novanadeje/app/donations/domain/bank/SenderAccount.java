package cz.novanadeje.app.donations.domain.bank;

import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public record SenderAccount(String accountNumber, String bankCode) {

    public static final int MAX_ACCOUNT_NUMBER_LENGTH = 17;
    public static final int BANK_CODE_LENGTH = 4;

    private static final Pattern CANONICAL_NUMBER = Pattern.compile("([1-9]\\d{0,5}-)?[1-9]\\d{0,9}");
    private static final Pattern RAW_NUMBER = Pattern.compile("(?:(\\d{1,6})-)?(\\d{1,10})");
    private static final Pattern BANK_CODE = Pattern.compile("\\d{4}");

    public SenderAccount {
        if (accountNumber == null || !CANONICAL_NUMBER.matcher(accountNumber).matches()) {
            throw new IllegalArgumentException("Not a canonical Czech account number: " + accountNumber);
        }
        if (bankCode == null || !BANK_CODE.matcher(bankCode).matches()) {
            throw new IllegalArgumentException("Not a Czech bank code: " + bankCode);
        }
    }

    public static Optional<SenderAccount> parse(String rawAccount, String rawBankCode) {
        if (rawAccount == null || rawAccount.isBlank() || rawBankCode == null || rawBankCode.isBlank()) {
            return Optional.empty();
        }
        String bankCode = withoutSpaces(rawBankCode);
        Matcher account = RAW_NUMBER.matcher(withoutSpaces(rawAccount));
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

    private static String withoutSpaces(String value) {
        return value.replaceAll("\\s", "");
    }

    private static String withoutLeadingZeros(String digits) {
        return digits.replaceFirst("^0+", "");
    }
}

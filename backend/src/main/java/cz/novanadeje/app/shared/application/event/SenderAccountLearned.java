package cz.novanadeje.app.shared.application.event;

import java.time.Instant;
import java.util.UUID;
import java.util.regex.Pattern;

public record SenderAccountLearned(UUID donorId, String accountLastDigits, Instant at) {

    private static final Pattern LAST_DIGITS = Pattern.compile("\\d{1,4}");

    public SenderAccountLearned {
        if (donorId == null || at == null) {
            throw new IllegalArgumentException("A learned sender account names its donor and the moment");
        }
        if (accountLastDigits == null || !LAST_DIGITS.matcher(accountLastDigits).matches()) {
            throw new IllegalArgumentException("A learned sender account is named only by its last four digits");
        }
    }
}

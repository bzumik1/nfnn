package cz.novanadeje.app.donations.domain.bankcode;

import java.time.Duration;
import java.time.Instant;
import java.util.Optional;

public record BankCodeListState(Optional<Instant> fetchedAt, Optional<String> sourceLastModified, Optional<Instant> checkedAt) {

    public static final Duration REFRESH_INTERVAL = Duration.ofDays(7);
    public static final int MAX_LAST_MODIFIED_LENGTH = 64;

    public BankCodeListState {
        if (fetchedAt == null || sourceLastModified == null || checkedAt == null) {
            throw new IllegalArgumentException("A bank code list state names what it does not know as empty");
        }
        if (sourceLastModified.filter(value -> !isUsableLastModified(value)).isPresent()) {
            throw new IllegalArgumentException("A source's last modification is printable ASCII of at most " + MAX_LAST_MODIFIED_LENGTH + " characters");
        }
    }

    public static BankCodeListState none() {
        return new BankCodeListState(Optional.empty(), Optional.empty(), Optional.empty());
    }

    public boolean isDue(Instant now) {
        return checkedAt.map(checked -> now.isAfter(checked.plus(REFRESH_INTERVAL))).orElse(true);
    }

    public BankCodeListState fetched(Instant at) {
        return new BankCodeListState(Optional.of(at), Optional.empty(), Optional.of(at));
    }

    public BankCodeListState fetched(Instant at, String lastModified) {
        return new BankCodeListState(Optional.of(at), Optional.ofNullable(lastModified).filter(BankCodeListState::isUsableLastModified), Optional.of(at));
    }

    public BankCodeListState unchanged(Instant at) {
        return new BankCodeListState(fetchedAt, sourceLastModified, Optional.of(at));
    }

    private static boolean isUsableLastModified(String value) {
        return !value.isBlank() && value.length() <= MAX_LAST_MODIFIED_LENGTH && value.chars().allMatch(c -> c >= 0x20 && c < 0x7f);
    }
}

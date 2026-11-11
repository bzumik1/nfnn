package cz.novanadeje.app.donations.domain.banklogo;

import cz.novanadeje.app.donations.domain.bankcode.BankCode;

import java.time.Duration;
import java.time.Instant;
import java.util.Optional;

public record BankLogo(BankCode code, BankLogoSource source, Optional<StoredBankLogoImage> image, Optional<Instant> fetchedAt,
                       Optional<Instant> checkedAt, Optional<BankLogoFailure> lastFailure) {

    public static final Duration REFRESH_INTERVAL = Duration.ofDays(7);

    public BankLogo {
        if (code == null || source == null || image == null || fetchedAt == null || checkedAt == null || lastFailure == null) {
            throw new IllegalArgumentException("A bank logo names its bank and source, and what it does not hold as empty");
        }
        if (!source.bank().equals(code)) {
            throw new IllegalArgumentException("A bank logo's source belongs to its own bank");
        }
        if (image.isPresent() != fetchedAt.isPresent()) {
            throw new IllegalArgumentException("A bank logo holds an image exactly when it was fetched");
        }
    }

    public static BankLogo from(BankLogoSource source) {
        return new BankLogo(source.bank(), source, Optional.empty(), Optional.empty(), Optional.empty(), Optional.empty());
    }

    public boolean isDue(Instant now) {
        return source.allowed() && (image.isEmpty() || checkedAt.map(checked -> now.isAfter(checked.plus(REFRESH_INTERVAL))).orElse(true));
    }

    public boolean holds(String sha256) {
        return image.map(stored -> stored.sha256().equals(sha256)).orElse(false);
    }

    public BankLogo fetched(StoredBankLogoImage fetched, Instant at) {
        return from(source, fetched, at);
    }

    public BankLogo from(BankLogoSource newSource, StoredBankLogoImage fetched, Instant at) {
        return new BankLogo(code, newSource, Optional.of(fetched), Optional.of(at), Optional.of(at), Optional.empty());
    }

    public BankLogo unchanged(Instant at) {
        return unchangedFrom(source, at);
    }

    public BankLogo unchangedFrom(BankLogoSource newSource, Instant at) {
        return new BankLogo(code, newSource, image, fetchedAt, Optional.of(at), Optional.empty());
    }

    public BankLogo failed(BankLogoFailure failure) {
        return new BankLogo(code, source, image, fetchedAt, checkedAt, Optional.of(failure));
    }
}

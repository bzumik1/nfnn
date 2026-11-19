package cz.novanadeje.app.donations.domain.receipt;

import cz.novanadeje.app.donations.domain.donor.DonorReference;

import java.time.Duration;
import java.time.Instant;

public final class ReceiptReplacementCaps {

    private static final int PER_DONOR_A_DAY = 20;
    private static final int PER_DONOR_A_YEAR = 60;
    private static final Duration DAY = Duration.ofHours(24);

    private ReceiptReplacementCaps() {
    }

    public static Instant dayCountedSince(Instant issuedAt) {
        return issuedAt.minus(DAY);
    }

    public static void refuseBeyondDay(DonorReference donor, long issuedInTheDay) {
        if (issuedInTheDay >= PER_DONOR_A_DAY) {
            throw ReceiptIssueLimitReached.inADay(donor, PER_DONOR_A_DAY);
        }
    }

    public static void refuseBeyondYear(DonorReference donor, long issuedInTheYear) {
        if (issuedInTheYear >= PER_DONOR_A_YEAR) {
            throw ReceiptIssueLimitReached.inAYear(donor, PER_DONOR_A_YEAR);
        }
    }
}

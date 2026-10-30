package cz.novanadeje.app.donations.domain.report;

import java.time.Instant;

public record ActivitySince(Instant from, Tally payments, Tally unpaired, long newDonors) {

    public ActivitySince {
        if (from == null || payments == null || unpaired == null) {
            throw new IllegalArgumentException("The activity since a moment has the moment and every one of its figures");
        }
        if (unpaired.count() > payments.count()) {
            throw new IllegalArgumentException("The unpaired payments are part of the new ones: " + unpaired.count() + " of " + payments.count());
        }
        if (newDonors < 0) {
            throw new IllegalArgumentException("New donors cannot be negative: " + newDonors);
        }
    }

    public Tally paired() {
        return payments.minus(unpaired);
    }

    public boolean isEmpty() {
        return payments.count() == 0 && newDonors == 0;
    }
}

package cz.novanadeje.app.donations.application.pairing;

import cz.novanadeje.app.donations.domain.donation.Donation;

import java.time.Year;
import java.util.List;

public record ConfirmedSymbolPairing(List<Donation> paired) {

    public ConfirmedSymbolPairing {
        if (paired == null) {
            throw new IllegalArgumentException("The paired donations are required");
        }
        paired = List.copyOf(paired);
    }

    public int count() {
        return paired.size();
    }

    public List<Year> years() {
        return paired.stream().map(Donation::receivedYear).distinct().sorted().toList();
    }
}

package cz.novanadeje.app.donations.domain.receipt;

import java.util.List;
import java.util.Optional;

public record NewReceipt(Optional<DonationReceipt> replaces, List<DonationReceipt> supersedes) {

    public NewReceipt {
        if (replaces == null || supersedes == null) {
            throw new IllegalArgumentException("What a new receipt replaces and supersedes is required");
        }
        supersedes = List.copyOf(supersedes);
    }
}

package cz.novanadeje.app.donations.domain.receipt;

import java.util.List;
import java.util.Optional;

public record NewReceipt(Optional<DonationReceipt> replaces, List<DonationReceipt> toSupersede) {

    public NewReceipt {
        if (replaces == null || toSupersede == null) {
            throw new IllegalArgumentException("What a new receipt replaces and which receipts it supersedes are required");
        }
        toSupersede = List.copyOf(toSupersede);
    }
}

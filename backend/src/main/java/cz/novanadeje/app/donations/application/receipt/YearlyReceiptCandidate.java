package cz.novanadeje.app.donations.application.receipt;

import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.donations.domain.receipt.ActiveYearlyReceipt;
import cz.novanadeje.app.shared.domain.DonorType;

import java.util.Optional;

public record YearlyReceiptCandidate(DonorReference donor, String name, DonorType type, int giftCount, long totalAmountMinor,
                                     Optional<ActiveYearlyReceipt> activeReceipt) {
}

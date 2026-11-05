package cz.novanadeje.app.donations.application.receipt;

import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.donations.domain.receipt.DonationReceipt;
import cz.novanadeje.app.donations.domain.receipt.ReceiptNumber;

import java.util.Optional;

public record YearlyReceiptResult(DonorReference donor, YearlyReceiptOutcome outcome, Optional<DonationReceipt> receipt, Optional<String> problem,
                                  Optional<ReceiptNumber> replaced) {

    static YearlyReceiptResult skipped(DonorReference donor, String problem) {
        return new YearlyReceiptResult(donor, YearlyReceiptOutcome.SKIPPED, Optional.empty(), Optional.of(problem), Optional.empty());
    }
}

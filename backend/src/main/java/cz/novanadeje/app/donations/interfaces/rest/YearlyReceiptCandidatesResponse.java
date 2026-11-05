package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.application.receipt.YearlyReceiptCandidate;
import cz.novanadeje.app.donations.application.receipt.YearlyReceiptCandidates;
import cz.novanadeje.app.shared.domain.DonorType;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

record YearlyReceiptCandidatesResponse(int year, int yearlyReceiptsAvailableThrough, int receiptsAvailableFrom, List<Donor> donors, int erasedDonors) {

    static YearlyReceiptCandidatesResponse from(YearlyReceiptCandidates candidates) {
        return new YearlyReceiptCandidatesResponse(candidates.year().getValue(), candidates.years().lastCompleted().getValue(),
                candidates.years().first().getValue(), candidates.donors().stream().map(Donor::from).toList(), candidates.erasedDonors());
    }

    record Donor(UUID donorId, String name, DonorType type, int giftCount, long totalAmountMinor, Receipt receipt) {

        static Donor from(YearlyReceiptCandidate candidate) {
            return new Donor(candidate.donor().value(), candidate.name(), candidate.type(), candidate.giftCount(), candidate.totalAmountMinor(),
                    candidate.activeReceipt().map(receipt -> new Receipt(receipt.id().value(), receipt.number().value(), receipt.issuedAt()))
                            .orElse(null));
        }
    }

    record Receipt(UUID id, String number, Instant issuedAt) {
    }
}

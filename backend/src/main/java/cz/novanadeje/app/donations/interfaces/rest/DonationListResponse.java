package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.application.overview.DonationOverview;
import cz.novanadeje.app.donations.domain.donation.Donation;
import cz.novanadeje.app.donations.domain.donation.DonationList;
import cz.novanadeje.app.donations.domain.donation.DonationSource;
import cz.novanadeje.app.donations.domain.donation.DonationStatus;
import cz.novanadeje.app.donations.domain.receipt.ReceiptNumber;
import cz.novanadeje.app.shared.domain.Currency;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

record DonationListResponse(List<DonationItemResponse> items, long totalAmountMinor, Currency currency, int count) {

    static DonationListResponse from(DonationOverview overview, String purpose) {
        DonationList list = overview.list();
        List<DonationItemResponse> items = list.items().stream()
                .map(donation -> DonationItemResponse.from(donation, overview.receiptNumberOf(donation).map(ReceiptNumber::value).orElse(null), purpose))
                .toList();
        return new DonationListResponse(items, list.total().amountMinor(), list.total().currency(), list.count());
    }

    record DonationItemResponse(UUID id, String receiptNumber, LocalDate receivedAt, long amountMinor, Currency currency, String purpose,
                                DonationStatus status, DonationSource source) {

        static DonationItemResponse from(Donation donation, String receiptNumber, String purpose) {
            return new DonationItemResponse(donation.id().value(), receiptNumber, donation.receivedOn(), donation.amount().amountMinor(),
                    donation.amount().currency(), purpose, donation.status(), donation.source());
        }
    }
}

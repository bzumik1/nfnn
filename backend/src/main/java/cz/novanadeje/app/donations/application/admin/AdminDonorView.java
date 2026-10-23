package cz.novanadeje.app.donations.application.admin;

import cz.novanadeje.app.donations.application.bankaccount.BankAccountView;
import cz.novanadeje.app.donations.application.overview.DonationOverview;
import cz.novanadeje.app.donations.domain.donation.DonationId;
import cz.novanadeje.app.donations.domain.donor.DonorRecord;
import cz.novanadeje.app.donations.domain.receipt.DonationReceipt;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Optional;

public record AdminDonorView(DonorRecord record, List<BankAccountView> bankAccounts, DonationOverview donations, List<DonationReceipt> receipts,
                             Map<DonationId, LocalDate> receivedDays) {

    public Optional<LocalDate> receivedOn(DonationReceipt receipt) {
        return receipt.donation().map(receivedDays::get);
    }
}

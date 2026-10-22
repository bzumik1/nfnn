package cz.novanadeje.app.donations.application.overview;

import cz.novanadeje.app.donations.domain.FoundationCalendar;
import cz.novanadeje.app.donations.domain.bank.SenderAccount;
import cz.novanadeje.app.donations.domain.donation.DonationList;
import cz.novanadeje.app.donations.domain.donation.DonationRepository;
import cz.novanadeje.app.donations.domain.donation.DonationSummary;
import cz.novanadeje.app.donations.domain.donor.DonorRecordRepository;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.donations.domain.donor.SenderAccountLink;
import cz.novanadeje.app.donations.domain.donor.SenderAccountLinkId;
import cz.novanadeje.app.donations.domain.donor.SymbolClaim;
import cz.novanadeje.app.donations.domain.donor.SymbolClaimId;
import cz.novanadeje.app.donations.domain.donor.SymbolClaimRepository;
import cz.novanadeje.app.donations.domain.receipt.DonationReceiptRepository;
import cz.novanadeje.app.donations.domain.receipt.FirstReceiptYear;
import cz.novanadeje.app.donations.domain.receipt.ReceiptCalendar;
import cz.novanadeje.app.shared.domain.VariableSymbol;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Year;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
@Transactional(readOnly = true)
public class DonorDonationsService {

    private final DonationRepository donations;
    private final DonationReceiptRepository receipts;
    private final DonorRecordRepository donorRecords;
    private final SymbolClaimRepository claims;
    private final Clock clock;
    private final FirstReceiptYear firstYear;

    public DonorDonationsService(DonationRepository donations, DonationReceiptRepository receipts, DonorRecordRepository donorRecords,
                                 SymbolClaimRepository claims, Clock clock, FirstReceiptYear firstYear) {
        this.donations = donations;
        this.receipts = receipts;
        this.donorRecords = donorRecords;
        this.claims = claims;
        this.clock = clock;
        this.firstYear = firstYear;
    }

    public DonationOverview listDonations(DonorReference donor, Optional<Year> year) {
        DonationList all = DonationList.of(donations.findByDonorNewestFirst(donor));
        DonationList listed = year.map(all::inYear).orElse(all);
        Map<SenderAccountLinkId, SenderAccount> linkedAccounts = donorRecords.findById(donor)
                .map(record -> record.senderAccountLinks().stream()
                        .collect(Collectors.toMap(SenderAccountLink::id, SenderAccountLink::account)))
                .orElseGet(Map::of);
        Map<SymbolClaimId, VariableSymbol> claimedSymbols = claims.findByDonor(donor).stream()
                .collect(Collectors.toMap(SymbolClaim::id, SymbolClaim::symbol));
        return new DonationOverview(listed, receipts.findActiveSingleNumbersFor(donor), linkedAccounts, claimedSymbols, firstYear);
    }

    public DonationSummaryView summarizeDonations(DonorReference donor) {
        DonationSummary summary = DonationSummary.of(donations.findByDonorNewestFirst(donor));
        return new DonationSummaryView(summary, ReceiptCalendar.lastCompleted(FoundationCalendar.today(clock)), firstYear.year());
    }
}

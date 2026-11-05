package cz.novanadeje.app.donations.application.sync;

import cz.novanadeje.app.donations.application.bankaccount.DonorBankAccountsService;
import cz.novanadeje.app.donations.application.overview.DonationSummaryView;
import cz.novanadeje.app.donations.domain.FoundationCalendar;
import cz.novanadeje.app.donations.domain.donation.Donation;
import cz.novanadeje.app.donations.domain.donation.DonationRepository;
import cz.novanadeje.app.donations.domain.donation.DonationSummary;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.donations.domain.donor.SymbolClaimRepository;
import cz.novanadeje.app.donations.domain.importing.BankImportStateRepository;
import cz.novanadeje.app.donations.domain.receipt.DonationReceiptRepository;
import cz.novanadeje.app.donations.domain.receipt.FirstReceiptYear;
import cz.novanadeje.app.donations.domain.receipt.ReceiptCalendar;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.util.List;

@Service
public class DonorSyncService {

    private final DonationRepository donations;
    private final DonationReceiptRepository receipts;
    private final SymbolClaimRepository claims;
    private final BankImportStateRepository importStates;
    private final DonorBankAccountsService bankAccounts;
    private final Clock clock;
    private final FirstReceiptYear firstYear;

    public DonorSyncService(DonationRepository donations, DonationReceiptRepository receipts, SymbolClaimRepository claims,
                            BankImportStateRepository importStates, DonorBankAccountsService bankAccounts, Clock clock, FirstReceiptYear firstYear) {
        this.donations = donations;
        this.receipts = receipts;
        this.claims = claims;
        this.importStates = importStates;
        this.bankAccounts = bankAccounts;
        this.clock = clock;
        this.firstYear = firstYear;
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public DonorSyncSnapshot snapshotOf(DonorReference donor) {
        List<Donation> gifts = donations.findByDonorNewestFirst(donor);
        DonationSummaryView summary = new DonationSummaryView(DonationSummary.of(gifts), ReceiptCalendar.lastCompleted(FoundationCalendar.today(clock)),
                firstYear.year());
        return new DonorSyncSnapshot(donor, gifts, summary, receipts.findByDonorNewestFirst(donor), bankAccounts.listBankAccounts(donor),
                claims.findByDonor(donor), importStates.current().lastSucceededAt());
    }
}

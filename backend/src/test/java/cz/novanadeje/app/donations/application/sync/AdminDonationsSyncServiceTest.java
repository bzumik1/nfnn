package cz.novanadeje.app.donations.application.sync;

import cz.novanadeje.app.donations.application.report.ReportAdministrationView;
import cz.novanadeje.app.donations.application.report.ReportSettingsService;
import cz.novanadeje.app.donations.domain.bank.BankPaymentRepository;
import cz.novanadeje.app.donations.domain.donation.DonationRepository;
import cz.novanadeje.app.donations.domain.donor.DonorRecord;
import cz.novanadeje.app.donations.domain.donor.DonorRecordRepository;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.donations.domain.donor.SymbolClaimRepository;
import cz.novanadeje.app.donations.domain.importing.BankImportState;
import cz.novanadeje.app.donations.domain.importing.BankImportStateRepository;
import cz.novanadeje.app.donations.domain.receipt.DonationReceipt;
import cz.novanadeje.app.donations.domain.receipt.DonationReceiptRepository;
import cz.novanadeje.app.donations.domain.receipt.Receipts;
import cz.novanadeje.app.donations.domain.report.ReportMonth;
import cz.novanadeje.app.donations.domain.report.ReportSettings;
import cz.novanadeje.app.donations.domain.report.YearOverview;
import cz.novanadeje.app.shared.application.account.AdministrationHolders;
import cz.novanadeje.app.shared.domain.EmailAddress;
import cz.novanadeje.app.shared.domain.LocaleCode;
import cz.novanadeje.app.shared.domain.PostalAddress;
import cz.novanadeje.app.shared.domain.UuidV7;
import cz.novanadeje.app.shared.domain.VariableSymbol;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.Year;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AdminDonationsSyncServiceTest {

    private static final Instant NOW = Instant.parse("2026-11-05T10:00:00Z");
    private static final LocalDate TODAY = LocalDate.of(2026, 11, 5);
    private static final DonorReference ADMIN = new DonorReference(UuidV7.generate(NOW));
    private static final PostalAddress ADDRESS = new PostalAddress("Dlouhá 12", "Ústí nad Labem", "400 01");

    @Mock
    private AdministrationHolders administrationHolders;
    @Mock
    private BankPaymentRepository payments;
    @Mock
    private DonationRepository donations;
    @Mock
    private DonorRecordRepository records;
    @Mock
    private SymbolClaimRepository claims;
    @Mock
    private DonationReceiptRepository receipts;
    @Mock
    private BankImportStateRepository importStates;
    @Mock
    private ReportSettingsService reportSettings;

    private AdminDonationsSyncService service;

    @BeforeEach
    void setUp() {
        service = new AdminDonationsSyncService(administrationHolders, payments, donations, records, claims, receipts, importStates, reportSettings,
                Clock.fixed(NOW, ZoneOffset.UTC));
    }

    @Test
    @DisplayName("Given an account that no longer holds the administration, when its snapshot is taken, then it holds no rows and nothing else is read")
    void should_hold_no_rows_when_snapshot_taken_given_account_without_administration() {
        when(administrationHolders.holdsAdministration(ADMIN.value())).thenReturn(false);

        AdminDonationsSyncSnapshot snapshot = service.snapshotFor(ADMIN);

        assertThat(snapshot).isEqualTo(AdminDonationsSyncSnapshot.withoutAdministration(ADMIN, TODAY));
        verifyNoInteractions(payments, donations, records, claims, receipts, importStates, reportSettings);
    }

    @Test
    @DisplayName("Given an administrator, an erased donor with a receipt and a donor with one, when the snapshot is taken, then the foundation's day and every offered year's overview come, the erased donor's record stays as a placeholder and only the other donor's receipt comes")
    void should_leave_out_erased_donors_receipts_and_compile_every_year_when_snapshot_taken_given_administrator() {
        DonorRecord jana = DonorRecord.registerPerson(new DonorReference(UuidV7.generate(NOW)), "Jana Nováková", ADDRESS,
                new VariableSymbol("4821937560"), LocaleCode.CS, NOW);
        DonorRecord erased = DonorRecord.registerPerson(new DonorReference(UuidV7.generate(NOW)), "Petr Svoboda", ADDRESS,
                new VariableSymbol("7310945528"), LocaleCode.CS, NOW);
        erased.erase(NOW);
        DonationReceipt janas = Receipts.yearlyReceiptOf(jana.id(), Year.of(2026));
        DonationReceipt erasedOnes = Receipts.yearlyReceiptOf(erased.id(), Year.of(2026));
        BankImportState importState = BankImportState.initial(NOW);
        ReportAdministrationView report = new ReportAdministrationView(ReportSettings.defaults(new EmailAddress("info@nfnn.cz")), Optional.empty(),
                List.of(), new ReportAdministrationView.NextReport(ReportMonth.of(2026, 11), LocalDate.of(2026, 12, 1)), ReportMonth.of(2026, 10), "0123456789abcdef");
        when(administrationHolders.holdsAdministration(ADMIN.value())).thenReturn(true);
        when(records.findAll()).thenReturn(List.of(jana, erased));
        when(payments.findAllNewestFirst()).thenReturn(List.of());
        when(donations.findAllNewestFirst()).thenReturn(List.of());
        when(claims.findAllNewestFirst()).thenReturn(List.of());
        when(receipts.findAllNewestFirst()).thenReturn(List.of(erasedOnes, janas));
        when(importStates.current()).thenReturn(importState);
        when(reportSettings.view()).thenReturn(report);

        AdminDonationsSyncSnapshot snapshot = service.snapshotFor(ADMIN);

        assertThat(snapshot.administrator()).isTrue();
        assertThat(snapshot.today()).isEqualTo(TODAY);
        assertThat(snapshot.years()).containsExactly(YearOverview.compile(Year.of(2026), TODAY, List.of(), List.of(),
                List.of(0L, 0L, 0L, 0L, 0L, 0L, 0L, 0L, 0L, 0L, 0L, 2L, 2L)));
        assertThat(snapshot.donorRecords()).containsExactly(jana, erased);
        assertThat(snapshot.receipts()).containsExactly(janas);
        assertThat(snapshot.importState()).contains(importState);
        assertThat(snapshot.report()).contains(report);
    }
}

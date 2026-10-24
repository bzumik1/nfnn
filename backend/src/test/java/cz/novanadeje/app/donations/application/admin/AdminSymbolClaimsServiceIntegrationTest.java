package cz.novanadeje.app.donations.application.admin;

import cz.novanadeje.app.TestcontainersConfiguration;
import cz.novanadeje.app.donations.application.bankaccount.DonorBankAccountsService;
import cz.novanadeje.app.donations.application.bankaccount.SymbolClaimConfirmation;
import cz.novanadeje.app.donations.application.bankaccount.SymbolClaimService;
import cz.novanadeje.app.donations.application.pairing.PairingOutcome;
import cz.novanadeje.app.donations.application.pairing.PaymentPairingService;
import cz.novanadeje.app.donations.application.receipt.DonationReceiptService;
import cz.novanadeje.app.donations.domain.bank.BankPaymentRepository;
import cz.novanadeje.app.donations.domain.bank.SenderAccount;
import cz.novanadeje.app.donations.domain.donation.DonationId;
import cz.novanadeje.app.donations.domain.donor.DonorRecord;
import cz.novanadeje.app.donations.domain.donor.DonorRecordRepository;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.donations.domain.donor.SenderAccountLinkId;
import cz.novanadeje.app.donations.domain.donor.SymbolClaimAnswer;
import cz.novanadeje.app.donations.domain.donor.SymbolClaimHasReceipt;
import cz.novanadeje.app.donations.domain.donor.SymbolClaimId;
import cz.novanadeje.app.donations.domain.donor.SymbolClaimNotConfirmed;
import cz.novanadeje.app.donations.domain.donor.SymbolClaimStillConfirmed;
import cz.novanadeje.app.donations.domain.receipt.ReceiptNumber;
import cz.novanadeje.app.shared.domain.LocaleCode;
import cz.novanadeje.app.shared.domain.Money;
import cz.novanadeje.app.shared.domain.PostalAddress;
import cz.novanadeje.app.shared.domain.UuidV7;
import cz.novanadeje.app.shared.domain.VariableSymbol;
import cz.novanadeje.app.support.DatabaseCleaner;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

import java.time.Instant;
import java.time.LocalDate;
import java.time.Year;
import java.time.YearMonth;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static cz.novanadeje.app.donations.BankPayments.payment;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = {"app.donations.fio.token=", "app.donations.report.cron=-", "app.contact.retention.cron=-", "app.content.media-cleanup.cron=-", "app.operations.backups.check-cron=-", "app.donors.registration-reminder.cron=-",
        "app.donations.receipt.first-year=2025"})
class AdminSymbolClaimsServiceIntegrationTest {

    private static final UUID ADMIN = UUID.fromString("01a18e56-bdb0-775a-bd0a-a60756831369");
    private static final SenderAccount ACCOUNT = new SenderAccount("1234567", "0800");
    private static final String JANAS_SYMBOL = "4821937560";
    private static final VariableSymbol OLD_SYMBOL = new VariableSymbol("6123456789");
    private static final Year YEAR_2025 = Year.of(2025);

    @Autowired
    private AdminSymbolClaimsService adminClaims;
    @Autowired
    private SymbolClaimService symbolClaims;
    @Autowired
    private DonorBankAccountsService bankAccounts;
    @Autowired
    private PaymentPairingService pairing;
    @Autowired
    private DonationReceiptService receipts;
    @Autowired
    private DonorRecordRepository donorRecords;
    @Autowired
    private BankPaymentRepository payments;
    @Autowired
    private JdbcClient jdbc;

    @AfterEach
    void cleanTables() {
        new DatabaseCleaner(jdbc).truncateAllTables();
    }

    @Test
    @DisplayName("Given a confirmed claim whose donations only a yearly receipt issued before them could cover, when an administrator reverses it, then its donations are deleted, the answer becomes DECLINED, a pairing run pairs nothing, the account asks nothing, the earlier yearly receipt is served again and the action is recorded")
    void should_delete_claimed_donations_and_decline_when_reversed_given_yearly_receipt_issued_before_them() {
        DonorReference jana = janaWithVerifiedAccountAndOldSymbolPayments();
        ReceiptNumber issuedBefore = receipts.yearlyReceipt(jana, YEAR_2025).number();
        SymbolClaimConfirmation confirmation = confirmOldSymbol(jana);
        assertThat(confirmation.pairedCount()).isEqualTo(3);
        assertThat(confirmation.changedYearlyReceipts()).containsExactly(YEAR_2025);
        SymbolClaimId claim = claimOf(jana);

        adminClaims.reverse(ADMIN, claim);

        assertThat(donationsPairedBy(claim)).isZero();
        assertThat(answerOf(claim)).isEqualTo("DECLINED");
        assertThat(donationsOf(jana)).isEqualTo(2);
        PairingOutcome rerun = pairing.pairUnpaired(Instant.now());
        assertThat(rerun.pairedBySymbol() + rerun.pairedByAccount() + rerun.pairedByConfirmedSymbol()).isZero();
        assertThat(rerun.leftUnpaired()).isEqualTo(3);
        assertThat(bankAccounts.listBankAccounts(jana)).singleElement().satisfies(row -> {
            assertThat(row.symbolOffer()).isEmpty();
            assertThat(row.confirmedSymbols()).isEmpty();
        });
        assertThat(receipts.yearlyReceipt(jana, YEAR_2025).number()).isEqualTo(issuedBefore);
        assertThat(jdbc.sql("select details from admin_action where admin_id = ? and action = 'REVERSE_SYMBOL_CLAIM' and subject_id = ?")
                .param(ADMIN).param(claim.value()).query(String.class).single()).contains(OLD_SYMBOL.value(), "smazané dary spárované přes ni: 3");
    }

    @Test
    @DisplayName("Given a confirmed claim and a single receipt issued for one of its donations, when an administrator reverses it, then the reversal is refused and the donations and the confirmed answer stay")
    void should_change_nothing_when_reversed_given_single_receipt_of_claimed_donation() {
        DonorReference jana = janaWithVerifiedAccountAndOldSymbolPayments();
        confirmOldSymbol(jana);
        SymbolClaimId claim = claimOf(jana);
        receipts.singleReceipt(jana, new DonationId(jdbc.sql("select id from donation where symbol_claim_id = ? order by received_on desc limit 1")
                .param(claim.value()).query(UUID.class).single()));

        assertThatThrownBy(() -> adminClaims.reverse(ADMIN, claim)).isInstanceOf(SymbolClaimHasReceipt.class);

        assertThat(donationsPairedBy(claim)).isEqualTo(3);
        assertThat(answerOf(claim)).isEqualTo("CONFIRMED");
        assertThat(adminActions()).isZero();
    }

    @Test
    @DisplayName("Given a confirmed claim and a yearly receipt issued after its donations were paired, when an administrator reverses it, then the reversal is refused and the donations and the confirmed answer stay")
    void should_change_nothing_when_reversed_given_yearly_receipt_issued_after_claimed_donations() {
        DonorReference jana = janaWithVerifiedAccountAndOldSymbolPayments();
        confirmOldSymbol(jana);
        SymbolClaimId claim = claimOf(jana);
        receipts.yearlyReceipt(jana, YEAR_2025);

        assertThatThrownBy(() -> adminClaims.reverse(ADMIN, claim)).isInstanceOf(SymbolClaimHasReceipt.class);

        assertThat(donationsPairedBy(claim)).isEqualTo(3);
        assertThat(answerOf(claim)).isEqualTo("CONFIRMED");
    }

    @Test
    @DisplayName("Given a declined claim, when an administrator reverses it, then the reversal is refused because only a confirmed answer can be reversed")
    void should_refuse_when_reversed_given_declined_claim() {
        DonorReference jana = janaWithVerifiedAccountAndOldSymbolPayments();
        symbolClaims.decline(jana, linkOf(jana), OLD_SYMBOL);
        SymbolClaimId claim = claimOf(jana);

        assertThatThrownBy(() -> adminClaims.reverse(ADMIN, claim)).isInstanceOf(SymbolClaimNotConfirmed.class);

        assertThat(answerOf(claim)).isEqualTo("DECLINED");
    }

    @Test
    @DisplayName("Given a declined claim, when an administrator deletes it, then the answer is gone, the account asks about the symbol again and the action is recorded")
    void should_ask_again_when_reset_given_declined_claim() {
        DonorReference jana = janaWithVerifiedAccountAndOldSymbolPayments();
        symbolClaims.decline(jana, linkOf(jana), OLD_SYMBOL);
        SymbolClaimId claim = claimOf(jana);

        adminClaims.reset(ADMIN, claim);

        assertThat(jdbc.sql("select count(*) from donor_symbol_claim").query(Long.class).single()).isZero();
        assertThat(bankAccounts.listBankAccounts(jana)).singleElement().satisfies(row -> assertThat(row.symbolOffer())
                .hasValueSatisfying(offer -> {
                    assertThat(offer.symbol()).isEqualTo(OLD_SYMBOL);
                    assertThat(offer.paymentCount()).isEqualTo(3);
                    assertThat(offer.firstMonth()).isEqualTo(YearMonth.of(2025, 3));
                    assertThat(offer.lastMonth()).isEqualTo(YearMonth.of(2026, 3));
                }));
        assertThat(jdbc.sql("select count(*) from admin_action where admin_id = ? and action = 'RESET_SYMBOL_CLAIM' and subject_id = ?")
                .param(ADMIN).param(claim.value()).query(Long.class).single()).isOne();
    }

    @Test
    @DisplayName("Given a confirmed claim, when an administrator deletes it, then the deletion is refused and its donations stay")
    void should_delete_nothing_when_reset_given_confirmed_claim() {
        DonorReference jana = janaWithVerifiedAccountAndOldSymbolPayments();
        confirmOldSymbol(jana);
        SymbolClaimId claim = claimOf(jana);

        assertThatThrownBy(() -> adminClaims.reset(ADMIN, claim)).isInstanceOf(SymbolClaimStillConfirmed.class);

        assertThat(answerOf(claim)).isEqualTo("CONFIRMED");
        assertThat(donationsPairedBy(claim)).isEqualTo(3);
    }

    @Test
    @DisplayName("Given a confirmed claim, when the answers are listed, then the claim comes with the donor, account, symbol, answer and its three donations")
    void should_show_claim_with_its_donations_when_listed_given_confirmed_claim() {
        DonorReference jana = janaWithVerifiedAccountAndOldSymbolPayments();
        confirmOldSymbol(jana);
        SymbolClaimId claim = claimOf(jana);

        List<SymbolClaimView> views = adminClaims.list();

        assertThat(views).singleElement().satisfies(view -> {
            assertThat(view.claim().id()).isEqualTo(claim);
            assertThat(view.claim().account()).isEqualTo(ACCOUNT);
            assertThat(view.claim().symbol()).isEqualTo(OLD_SYMBOL);
            assertThat(view.claim().answer()).isEqualTo(SymbolClaimAnswer.CONFIRMED);
            assertThat(view.donor()).map(DonorRecord::name).contains("Jana Nováková");
            assertThat(view.donationCount()).isEqualTo(3);
        });
    }

    private DonorReference janaWithVerifiedAccountAndOldSymbolPayments() {
        Instant now = Instant.now();
        DonorRecord jana = DonorRecord.registerPerson(new DonorReference(UuidV7.generate(now)), "Jana Nováková",
                new PostalAddress("Dlouhá 12", "Ústí nad Labem", "400 01"), new VariableSymbol(JANAS_SYMBOL), LocaleCode.CS, now);
        donorRecords.save(jana);
        Optional<SenderAccount> account = Optional.of(ACCOUNT);
        payments.saveAll(List.of(
                payment(9001, LocalDate.of(2025, 1, 10), Money.czk(30000), account, JANAS_SYMBOL),
                payment(9002, LocalDate.of(2025, 3, 15), Money.czk(50000), account, OLD_SYMBOL.value()),
                payment(9003, LocalDate.of(2025, 9, 15), Money.czk(50000), account, OLD_SYMBOL.value()),
                payment(9004, LocalDate.of(2026, 3, 15), Money.czk(50000), account, OLD_SYMBOL.value()),
                payment(9005, LocalDate.of(2026, 9, 1), Money.czk(100), account, JANAS_SYMBOL, "OVERENI UCTU NADACNI FOND NOVA NADEJE")));
        pairing.pairUnpaired(now);
        return jana.id();
    }

    private SymbolClaimConfirmation confirmOldSymbol(DonorReference donor) {
        return symbolClaims.confirm(donor, linkOf(donor), OLD_SYMBOL);
    }

    private SenderAccountLinkId linkOf(DonorReference donor) {
        return bankAccounts.listBankAccounts(donor).getFirst().link().id();
    }

    private SymbolClaimId claimOf(DonorReference donor) {
        return new SymbolClaimId(jdbc.sql("select id from donor_symbol_claim where donor_id = ?").param(donor.value()).query(UUID.class).single());
    }

    private String answerOf(SymbolClaimId claim) {
        return jdbc.sql("select answer from donor_symbol_claim where id = ?").param(claim.value()).query(String.class).single();
    }

    private long donationsPairedBy(SymbolClaimId claim) {
        return jdbc.sql("select count(*) from donation where symbol_claim_id = ?").param(claim.value()).query(Long.class).single();
    }

    private long donationsOf(DonorReference donor) {
        return jdbc.sql("select count(*) from donation where donor_id = ?").param(donor.value()).query(Long.class).single();
    }

    private long adminActions() {
        return jdbc.sql("select count(*) from admin_action").query(Long.class).single();
    }
}

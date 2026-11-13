package cz.novanadeje.app.donations.application.pairing;

import cz.novanadeje.app.donations.application.receipt.AdministrationChannel;
import cz.novanadeje.app.donations.domain.bank.BankPayment;
import cz.novanadeje.app.donations.domain.bank.BankPaymentAlreadyPaired;
import cz.novanadeje.app.donations.domain.bank.BankPaymentId;
import cz.novanadeje.app.donations.domain.bank.BankPaymentNotFound;
import cz.novanadeje.app.donations.domain.bank.BankPaymentNotPaired;
import cz.novanadeje.app.donations.domain.bank.BankPaymentRepository;
import cz.novanadeje.app.donations.domain.bank.SenderAccount;
import cz.novanadeje.app.donations.domain.donation.Donation;
import cz.novanadeje.app.donations.domain.donation.DonationHasReceipt;
import cz.novanadeje.app.donations.domain.donation.DonationId;
import cz.novanadeje.app.donations.domain.donation.DonationRepository;
import cz.novanadeje.app.donations.domain.donation.PairingMethod;
import cz.novanadeje.app.donations.domain.donor.DonorRecord;
import cz.novanadeje.app.donations.domain.donor.DonorRecordNotFound;
import cz.novanadeje.app.donations.domain.donor.DonorRecordRepository;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.donations.domain.receipt.DonationReceipt;
import cz.novanadeje.app.donations.domain.receipt.DonationReceiptId;
import cz.novanadeje.app.donations.domain.receipt.DonationReceiptRepository;
import cz.novanadeje.app.donations.domain.receipt.ReceiptFingerprint;
import cz.novanadeje.app.donations.domain.receipt.ReceiptStatus;
import cz.novanadeje.app.donations.domain.receipt.ReceiptWithdrawal;
import cz.novanadeje.app.donations.domain.receipt.ReceiptWithdrawalInBrowserOnly;
import cz.novanadeje.app.donations.domain.receipt.ReceiptWithdrawalReason;
import cz.novanadeje.app.donations.domain.receipt.FirstReceiptYear;
import cz.novanadeje.app.donations.application.admincopy.AdminDonationsRows;
import cz.novanadeje.app.donations.application.admincopy.AdminSyncRows;
import cz.novanadeje.app.donations.domain.ChangedMeanwhile;
import cz.novanadeje.app.shared.application.event.AdminActionPerformed;
import cz.novanadeje.app.shared.application.version.ExpectedVersion;
import cz.novanadeje.app.shared.infrastructure.json.RowVersionsFixture;
import cz.novanadeje.app.shared.domain.UuidV7;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
import org.springframework.context.ApplicationEventPublisher;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.Year;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static cz.novanadeje.app.donations.BankPayments.payment;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.frozen;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.jana;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.yearlyDocument;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.yearlyReceiptOf;
import static cz.novanadeje.app.shared.domain.Money.czk;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ManualPairingServiceTest {

    private static final Instant NOW = Instant.parse("2027-01-20T09:00:00Z");
    private static final UUID ADMIN = UuidV7.generate(NOW);
    private static final FirstReceiptYear FROM_2026 = new FirstReceiptYear(Year.of(2026));
    private static final SenderAccount ACCOUNT = new SenderAccount("2900233333", "2010");

    private final DonorRecord janaRecord = jana();
    private final DonorReference janaId = janaRecord.id();
    private final BankPayment unknownSymbol = payment(1001, LocalDate.of(2026, 11, 5), czk(50000), Optional.of(ACCOUNT), "1111111111");
    private final BankPayment lastYear = payment(1002, LocalDate.of(2025, 3, 5), czk(20000), Optional.of(ACCOUNT), null);
    private final Donation paired = Donation.fromBankPayment(DonationId.newId(NOW), janaId, unknownSymbol, PairingMethod.VARIABLE_SYMBOL, NOW);

    private final BankPaymentRepository payments = mock(BankPaymentRepository.class);
    private final DonorRecordRepository donorRecords = mock(DonorRecordRepository.class);
    private final DonationRepository donations = mock(DonationRepository.class);
    private final DonationReceiptRepository receipts = mock(DonationReceiptRepository.class);
    private final PairingLock lock = mock(PairingLock.class);
    private final ApplicationEventPublisher events = mock(ApplicationEventPublisher.class);
    private final ManualPairingService service = new ManualPairingService(payments, donorRecords, donations, receipts, lock, events, FROM_2026,
            new AdminDonationsRows(RowVersionsFixture.canonical(), donations, donorRecords), Clock.fixed(NOW, ZoneOffset.UTC));

    @BeforeEach
    void janaIsRegisteredAndTwoPaymentsAreStored() {
        when(donorRecords.findById(janaId)).thenReturn(Optional.of(janaRecord));
        when(payments.findById(unknownSymbol.id())).thenReturn(Optional.of(unknownSymbol));
        when(payments.findById(lastYear.id())).thenReturn(Optional.of(lastYear));
    }

    @Test
    @DisplayName("Given an unpaired payment and a donor, when paired by hand, then the lock is taken first, a MANUAL donation is stored and the action is audited")
    void should_store_manual_donation_and_audit_when_paired_given_unpaired_payment() {
        ManualPairingResult result = service.pair(ADMIN, unknownSymbol.id(), janaId, ExpectedVersion.none());

        ArgumentCaptor<Donation> stored = ArgumentCaptor.forClass(Donation.class);
        InOrder order = inOrder(lock, receipts, donations, events);
        order.verify(lock).acquire();
        order.verify(receipts).lockDonor(janaId);
        order.verify(donations).save(stored.capture());
        ArgumentCaptor<AdminActionPerformed> audited = ArgumentCaptor.forClass(AdminActionPerformed.class);
        order.verify(events).publishEvent(audited.capture());
        Donation donation = stored.getValue();
        assertThat(donation.donor()).isEqualTo(janaId);
        assertThat(donation.bankPayment()).contains(unknownSymbol.id());
        assertThat(donation.pairedBy()).contains(PairingMethod.MANUAL);
        assertThat(donation.amount()).isEqualTo(czk(50000));
        assertThat(donation.recordedAt()).isEqualTo(NOW);
        assertThat(result.donationId()).isEqualTo(donation.id());
        assertThat(result.changedYearlyReceipts()).isEmpty();
        assertThat(audited.getValue().adminId()).isEqualTo(ADMIN);
        assertThat(audited.getValue().action()).isEqualTo("PAIR_PAYMENT");
        assertThat(audited.getValue().subjectId()).contains(unknownSymbol.id().value());
        assertThat(audited.getValue().details()).contains("1001").contains(janaId.toString()).contains(donation.id().toString());
        assertThat(audited.getValue().performedAt()).isEqualTo(NOW);
    }

    @Test
    @DisplayName("Given the donor already downloaded the yearly receipt of the payment's year, when paired by hand, then the result names that year")
    void should_name_changed_yearly_receipt_when_paired_given_issued_yearly_receipt() {
        when(receipts.findActiveForYear(janaId, Year.of(2026))).thenReturn(Optional.of(yearlyReceiptOf(janaId, Year.of(2026))));

        ManualPairingResult result = service.pair(ADMIN, unknownSymbol.id(), janaId, ExpectedVersion.none());

        assertThat(result.changedYearlyReceipts()).containsExactly(Year.of(2026));
    }

    @Test
    @DisplayName("Given a payment from before the first receipt year, when paired by hand, then no yearly receipt is reported even if one exists")
    void should_report_no_changed_receipt_when_paired_given_payment_before_first_receipt_year() {
        when(receipts.findActiveForYear(janaId, Year.of(2025))).thenReturn(Optional.of(yearlyReceiptOf(janaId, Year.of(2025))));

        ManualPairingResult result = service.pair(ADMIN, lastYear.id(), janaId, ExpectedVersion.none());

        assertThat(result.changedYearlyReceipts()).isEmpty();
    }

    @Test
    @DisplayName("Given an unknown payment, when paired by hand, then it is not found and nothing is stored")
    void should_refuse_when_paired_given_unknown_payment() {
        BankPaymentId unknown = BankPaymentId.newId(NOW);

        assertThatThrownBy(() -> service.pair(ADMIN, unknown, janaId, ExpectedVersion.none())).isInstanceOf(BankPaymentNotFound.class);

        verify(donations, never()).save(any());
        verify(events, never()).publishEvent(any());
    }

    @Test
    @DisplayName("Given a payment that already has a donation, when paired by hand, then the conflict is reported")
    void should_refuse_when_paired_given_already_paired_payment() {
        when(donations.existsForBankPayment(unknownSymbol.id())).thenReturn(true);

        assertThatThrownBy(() -> service.pair(ADMIN, unknownSymbol.id(), janaId, ExpectedVersion.none())).isInstanceOf(BankPaymentAlreadyPaired.class);

        verify(donations, never()).save(any());
    }

    @Test
    @DisplayName("Given a donor without a record in donations, when paired by hand, then the donor is not found")
    void should_refuse_when_paired_given_unknown_donor() {
        DonorReference unknown = new DonorReference(UuidV7.generate(NOW.plusSeconds(1)));

        assertThatThrownBy(() -> service.pair(ADMIN, unknownSymbol.id(), unknown, ExpectedVersion.none())).isInstanceOf(DonorRecordNotFound.class);

        verify(donations, never()).save(any());
    }

    @Test
    @DisplayName("Given a paired payment without a receipt, when unpaired, then the donation is deleted, the payment is held out of automatic pairing and the action is audited")
    void should_delete_donation_hold_payment_and_audit_when_unpaired_given_paired_payment() {
        when(donations.findByBankPayment(unknownSymbol.id())).thenReturn(Optional.of(paired));

        List<Year> changed = service.unpair(ADMIN, AdministrationChannel.BROWSER, unknownSymbol.id(), ExpectedVersion.none());

        ArgumentCaptor<BankPayment> held = ArgumentCaptor.forClass(BankPayment.class);
        ArgumentCaptor<AdminActionPerformed> audited = ArgumentCaptor.forClass(AdminActionPerformed.class);
        InOrder order = inOrder(lock, receipts, donations, payments, events);
        order.verify(lock).acquire();
        order.verify(receipts).lockDonor(janaId);
        order.verify(donations).delete(paired.id());
        order.verify(payments).save(held.capture());
        order.verify(events).publishEvent(audited.capture());
        assertThat(held.getValue().id()).isEqualTo(unknownSymbol.id());
        assertThat(held.getValue().unpairedByAdminAt()).contains(NOW);
        assertThat(changed).isEmpty();
        assertThat(audited.getValue().action()).isEqualTo("UNPAIR_PAYMENT");
        assertThat(audited.getValue().subjectId()).contains(unknownSymbol.id().value());
        assertThat(audited.getValue().details()).contains("1001").contains(janaId.toString()).contains(paired.id().toString());
    }

    @Test
    @DisplayName("Given a donation listed on the donor's active yearly receipt, when unpaired, then that receipt is withdrawn because the donations changed, saved before the donation goes, audited and its year reported")
    void should_withdraw_yearly_receipt_and_audit_when_unpaired_given_donation_listed_on_active_yearly_receipt() {
        DonationReceipt yearly = yearlyReceiptListing(paired);
        when(donations.findByBankPayment(unknownSymbol.id())).thenReturn(Optional.of(paired));
        when(receipts.findActiveForYear(janaId, Year.of(2026))).thenReturn(Optional.of(yearly));

        List<Year> changed = service.unpair(ADMIN, AdministrationChannel.BROWSER, unknownSymbol.id(), ExpectedVersion.none());

        ArgumentCaptor<DonationReceipt> saved = ArgumentCaptor.forClass(DonationReceipt.class);
        ArgumentCaptor<AdminActionPerformed> audited = ArgumentCaptor.forClass(AdminActionPerformed.class);
        InOrder order = inOrder(lock, receipts, donations);
        order.verify(lock).acquire();
        order.verify(receipts).lockDonor(janaId);
        order.verify(receipts).save(saved.capture());
        order.verify(donations).delete(paired.id());
        verify(events, times(2)).publishEvent(audited.capture());
        assertThat(changed).containsExactly(Year.of(2026));
        assertThat(saved.getValue().id()).isEqualTo(yearly.id());
        assertThat(saved.getValue().status()).isEqualTo(ReceiptStatus.WITHDRAWN);
        assertThat(saved.getValue().withdrawal()).contains(new ReceiptWithdrawal(NOW, ReceiptWithdrawalReason.DONATIONS_CHANGED));
        AdminActionPerformed withdrawal = audited.getAllValues().stream()
                .filter(action -> action.action().equals("WITHDRAW_RECEIPT")).findFirst().orElseThrow();
        assertThat(withdrawal.adminId()).isEqualTo(ADMIN);
        assertThat(withdrawal.subjectId()).contains(yearly.id().value());
        assertThat(withdrawal.performedAt()).isEqualTo(NOW);
        assertThat(withdrawal.details()).isEqualTo("Potvrzení " + yearly.number() + " za rok 2026 dárce " + janaId
                + " zrušeno, protože z něj byl odebrán dar " + paired.id() + " platby 1001");
    }

    @Test
    @DisplayName("Given a donation listed on the donor's active yearly receipt, when a connected application unpairs it, then it is refused as browser-only and nothing changes")
    void should_refuse_when_connected_application_unpairs_given_donation_listed_on_active_yearly_receipt() {
        DonationReceipt yearly = yearlyReceiptListing(paired);
        when(donations.findByBankPayment(unknownSymbol.id())).thenReturn(Optional.of(paired));
        when(receipts.findActiveForYear(janaId, Year.of(2026))).thenReturn(Optional.of(yearly));

        assertThatThrownBy(() -> service.unpair(ADMIN, AdministrationChannel.CONNECTED_APPLICATION, unknownSymbol.id(), ExpectedVersion.none()))
                .isInstanceOf(ReceiptWithdrawalInBrowserOnly.class);

        assertThat(yearly.isActive()).isTrue();
        verify(receipts, never()).save(any());
        verify(donations, never()).delete(any());
        verify(payments, never()).save(any());
        verify(events, never()).publishEvent(any());
    }

    @Test
    @DisplayName("Given a donation the donor's active yearly receipt does not list, when a connected application unpairs it, then it is unpaired as in the browser and the receipt stays active")
    void should_unpair_when_connected_application_unpairs_given_active_yearly_receipt_not_listing_the_donation() {
        DonationReceipt yearly = yearlyReceiptOf(janaId, Year.of(2026));
        when(donations.findByBankPayment(unknownSymbol.id())).thenReturn(Optional.of(paired));
        when(receipts.findActiveForYear(janaId, Year.of(2026))).thenReturn(Optional.of(yearly));

        assertThat(service.unpair(ADMIN, AdministrationChannel.CONNECTED_APPLICATION, unknownSymbol.id(), ExpectedVersion.none())).isEmpty();

        verify(donations).delete(paired.id());
        assertThat(yearly.isActive()).isTrue();
    }

    @Test
    @DisplayName("Given a donor without an active yearly receipt of the year, when a connected application unpairs a donation, then it is unpaired as in the browser")
    void should_unpair_when_connected_application_unpairs_given_no_active_yearly_receipt() {
        when(donations.findByBankPayment(unknownSymbol.id())).thenReturn(Optional.of(paired));
        when(receipts.findActiveForYear(janaId, Year.of(2026))).thenReturn(Optional.empty());

        assertThat(service.unpair(ADMIN, AdministrationChannel.CONNECTED_APPLICATION, unknownSymbol.id(), ExpectedVersion.none())).isEmpty();

        verify(donations).delete(paired.id());
        verify(payments).save(any());
        verify(receipts, never()).save(any());
    }

    @Test
    @DisplayName("Given the donor's active yearly receipt was issued before the donation was paired, when unpaired, then the receipt stays active, nothing is withdrawn and no year is reported")
    void should_keep_yearly_receipt_when_unpaired_given_active_yearly_receipt_without_the_donation() {
        when(donations.findByBankPayment(unknownSymbol.id())).thenReturn(Optional.of(paired));
        when(receipts.findActiveForYear(janaId, Year.of(2026))).thenReturn(Optional.of(yearlyReceiptOf(janaId, Year.of(2026))));

        List<Year> changed = service.unpair(ADMIN, AdministrationChannel.BROWSER, unknownSymbol.id(), ExpectedVersion.none());

        assertThat(changed).isEmpty();
        verify(receipts, never()).save(any());
        verify(events, times(1)).publishEvent(any(AdminActionPerformed.class));
    }

    @Test
    @DisplayName("Given a donation with an issued single receipt, when unpaired, then the conflict is reported and nothing changes")
    void should_refuse_when_unpaired_given_donation_with_receipt() {
        when(donations.findByBankPayment(unknownSymbol.id())).thenReturn(Optional.of(paired));
        when(receipts.existsForDonation(paired.id())).thenReturn(true);

        assertThatThrownBy(() -> service.unpair(ADMIN, AdministrationChannel.BROWSER, unknownSymbol.id(), ExpectedVersion.none())).isInstanceOf(DonationHasReceipt.class);

        verify(donations, never()).delete(any());
        verify(payments, never()).save(any());
        verify(events, never()).publishEvent(any());
    }

    @Test
    @DisplayName("Given an unpaired payment, when unpaired, then the conflict is reported")
    void should_refuse_when_unpaired_given_unpaired_payment() {
        assertThatThrownBy(() -> service.unpair(ADMIN, AdministrationChannel.BROWSER, unknownSymbol.id(), ExpectedVersion.none())).isInstanceOf(BankPaymentNotPaired.class);

        verify(payments, never()).save(any());
    }

    @Test
    @DisplayName("Given a donation with an issued single receipt in a year with an active yearly receipt listing it, when unpaired, then the conflict is reported and the yearly receipt stays active")
    void should_keep_yearly_receipt_when_unpair_refused_given_donation_with_single_receipt() {
        DonationReceipt yearly = yearlyReceiptListing(paired);
        when(donations.findByBankPayment(unknownSymbol.id())).thenReturn(Optional.of(paired));
        when(receipts.existsForDonation(paired.id())).thenReturn(true);
        when(receipts.findActiveForYear(janaId, Year.of(2026))).thenReturn(Optional.of(yearly));

        assertThatThrownBy(() -> service.unpair(ADMIN, AdministrationChannel.BROWSER, unknownSymbol.id(), ExpectedVersion.none())).isInstanceOf(DonationHasReceipt.class);

        assertThat(yearly.isActive()).isTrue();
        verify(receipts, never()).save(any());
    }

    @Test
    @DisplayName("Given an unknown payment, when unpaired, then it is not found")
    void should_refuse_when_unpaired_given_unknown_payment() {
        assertThatThrownBy(() -> service.unpair(ADMIN, AdministrationChannel.BROWSER, BankPaymentId.newId(NOW), ExpectedVersion.none())).isInstanceOf(BankPaymentNotFound.class);
    }

    private DonationReceipt yearlyReceiptListing(Donation donation) {
        return DonationReceipt.issue(DonationReceiptId.newId(NOW), janaId, NOW, new ReceiptFingerprint("5".repeat(64)),
                frozen(yearlyDocument(janaRecord, List.of(donation))), Optional.empty());
    }
    @Test
    @DisplayName("Given the payment was paired since an administrator read it, when they pair it with the version they read, then the lock is taken first and it is refused with the current version and row, storing and auditing nothing")
    void should_refuse_with_the_current_row_when_paired_given_a_stale_version() {
        AdminDonationsRows rows = new AdminDonationsRows(RowVersionsFixture.canonical(), donations, donorRecords);
        String readVersion = rows.currentPayment(unknownSymbol).version();
        when(donations.findByBankPayment(unknownSymbol.id())).thenReturn(Optional.of(paired));
        String currentVersion = rows.currentPayment(unknownSymbol).version();

        assertThatThrownBy(() -> service.pair(ADMIN, unknownSymbol.id(), janaId, ExpectedVersion.of(readVersion)))
                .isInstanceOfSatisfying(ChangedMeanwhile.class, refusal -> {
                    assertThat(refusal.code()).isEqualTo("donations/changed-meanwhile");
                    assertThat(currentVersion).isNotEqualTo(readVersion);
                    assertThat(refusal.extensions()).containsEntry("version", currentVersion);
                    assertThat(refusal.extensions().get("current")).isInstanceOfSatisfying(AdminSyncRows.PaymentWithGift.class, current -> {
                        assertThat(current.payment().version()).isEqualTo(currentVersion);
                        assertThat(current.donation()).isNotNull();
                    });
                });

        InOrder order = inOrder(lock, donations);
        order.verify(lock).acquire();
        order.verify(donations, atLeastOnce()).findByBankPayment(unknownSymbol.id());
        verify(donations, never()).save(any());
        verify(events, never()).publishEvent(any());
    }

    @Test
    @DisplayName("Given a paired payment unchanged since an administrator read it, when they unpair it with that version, then it is unpaired")
    void should_unpair_when_unpaired_given_the_current_version() {
        when(donations.findByBankPayment(unknownSymbol.id())).thenReturn(Optional.of(paired));
        String version = new AdminDonationsRows(RowVersionsFixture.canonical(), donations, donorRecords).currentPayment(unknownSymbol).version();

        service.unpair(ADMIN, AdministrationChannel.BROWSER, unknownSymbol.id(), ExpectedVersion.of(version));

        verify(donations).delete(paired.id());
    }
}

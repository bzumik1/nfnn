package cz.novanadeje.app.donations.application.pairing;

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
import cz.novanadeje.app.donations.domain.receipt.DonationReceiptRepository;
import cz.novanadeje.app.donations.domain.receipt.FirstReceiptYear;
import cz.novanadeje.app.shared.application.event.AdminActionPerformed;
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
import static cz.novanadeje.app.donations.domain.receipt.Receipts.jana;
import static cz.novanadeje.app.shared.domain.Money.czk;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
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
            Clock.fixed(NOW, ZoneOffset.UTC));

    @BeforeEach
    void janaIsRegisteredAndTwoPaymentsAreStored() {
        when(donorRecords.findById(janaId)).thenReturn(Optional.of(janaRecord));
        when(payments.findById(unknownSymbol.id())).thenReturn(Optional.of(unknownSymbol));
        when(payments.findById(lastYear.id())).thenReturn(Optional.of(lastYear));
    }

    @Test
    @DisplayName("Given an unpaired payment and a donor, when paired by hand, then the lock is taken first, a MANUAL donation is stored and the action is audited")
    void should_store_manual_donation_and_audit_when_paired_given_unpaired_payment() {
        ManualPairingResult result = service.pair(ADMIN, unknownSymbol.id(), janaId);

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
        when(receipts.findActiveForYear(janaId, Year.of(2026))).thenReturn(Optional.of(mock(DonationReceipt.class)));

        ManualPairingResult result = service.pair(ADMIN, unknownSymbol.id(), janaId);

        assertThat(result.changedYearlyReceipts()).containsExactly(Year.of(2026));
    }

    @Test
    @DisplayName("Given a payment from before the first receipt year, when paired by hand, then no yearly receipt is reported even if one exists")
    void should_report_no_changed_receipt_when_paired_given_payment_before_first_receipt_year() {
        when(receipts.findActiveForYear(janaId, Year.of(2025))).thenReturn(Optional.of(mock(DonationReceipt.class)));

        ManualPairingResult result = service.pair(ADMIN, lastYear.id(), janaId);

        assertThat(result.changedYearlyReceipts()).isEmpty();
    }

    @Test
    @DisplayName("Given an unknown payment, when paired by hand, then it is not found and nothing is stored")
    void should_refuse_when_paired_given_unknown_payment() {
        BankPaymentId unknown = BankPaymentId.newId(NOW);

        assertThatThrownBy(() -> service.pair(ADMIN, unknown, janaId)).isInstanceOf(BankPaymentNotFound.class);

        verify(donations, never()).save(any());
        verify(events, never()).publishEvent(any());
    }

    @Test
    @DisplayName("Given a payment that already has a donation, when paired by hand, then the conflict is reported")
    void should_refuse_when_paired_given_already_paired_payment() {
        when(donations.existsForBankPayment(unknownSymbol.id())).thenReturn(true);

        assertThatThrownBy(() -> service.pair(ADMIN, unknownSymbol.id(), janaId)).isInstanceOf(BankPaymentAlreadyPaired.class);

        verify(donations, never()).save(any());
    }

    @Test
    @DisplayName("Given a donor without a record in donations, when paired by hand, then the donor is not found")
    void should_refuse_when_paired_given_unknown_donor() {
        DonorReference unknown = new DonorReference(UuidV7.generate(NOW.plusSeconds(1)));

        assertThatThrownBy(() -> service.pair(ADMIN, unknownSymbol.id(), unknown)).isInstanceOf(DonorRecordNotFound.class);

        verify(donations, never()).save(any());
    }

    @Test
    @DisplayName("Given a paired payment without a receipt, when unpaired, then the donation is deleted, the payment is held out of automatic pairing and the action is audited")
    void should_delete_donation_hold_payment_and_audit_when_unpaired_given_paired_payment() {
        when(donations.findByBankPayment(unknownSymbol.id())).thenReturn(Optional.of(paired));

        List<Year> changed = service.unpair(ADMIN, unknownSymbol.id());

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
    @DisplayName("Given a paired payment of a year with an issued yearly receipt, when unpaired, then that year is reported")
    void should_name_changed_yearly_receipt_when_unpaired_given_issued_yearly_receipt() {
        when(donations.findByBankPayment(unknownSymbol.id())).thenReturn(Optional.of(paired));
        when(receipts.findActiveForYear(janaId, Year.of(2026))).thenReturn(Optional.of(mock(DonationReceipt.class)));

        assertThat(service.unpair(ADMIN, unknownSymbol.id())).containsExactly(Year.of(2026));
    }

    @Test
    @DisplayName("Given a donation with an issued single receipt, when unpaired, then the conflict is reported and nothing changes")
    void should_refuse_when_unpaired_given_donation_with_receipt() {
        when(donations.findByBankPayment(unknownSymbol.id())).thenReturn(Optional.of(paired));
        when(receipts.existsForDonation(paired.id())).thenReturn(true);

        assertThatThrownBy(() -> service.unpair(ADMIN, unknownSymbol.id())).isInstanceOf(DonationHasReceipt.class);

        verify(donations, never()).delete(any());
        verify(payments, never()).save(any());
        verify(events, never()).publishEvent(any());
    }

    @Test
    @DisplayName("Given an unpaired payment, when unpaired, then the conflict is reported")
    void should_refuse_when_unpaired_given_unpaired_payment() {
        assertThatThrownBy(() -> service.unpair(ADMIN, unknownSymbol.id())).isInstanceOf(BankPaymentNotPaired.class);

        verify(payments, never()).save(any());
    }

    @Test
    @DisplayName("Given an unknown payment, when unpaired, then it is not found")
    void should_refuse_when_unpaired_given_unknown_payment() {
        assertThatThrownBy(() -> service.unpair(ADMIN, BankPaymentId.newId(NOW))).isInstanceOf(BankPaymentNotFound.class);
    }
}

package cz.novanadeje.app.donations.application.admin;

import cz.novanadeje.app.donations.application.pairing.PairingLock;
import cz.novanadeje.app.donations.domain.bank.BankPayment;
import cz.novanadeje.app.donations.domain.bank.SenderAccount;
import cz.novanadeje.app.donations.domain.donation.Donation;
import cz.novanadeje.app.donations.domain.donation.DonationId;
import cz.novanadeje.app.donations.domain.donation.DonationRepository;
import cz.novanadeje.app.donations.domain.donor.DonorRecord;
import cz.novanadeje.app.donations.domain.donor.DonorRecordRepository;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.donations.domain.donor.SenderAccountLinkId;
import cz.novanadeje.app.donations.domain.donor.SymbolClaim;
import cz.novanadeje.app.donations.domain.donor.SymbolClaimAnswer;
import cz.novanadeje.app.donations.domain.donor.SymbolClaimHasReceipt;
import cz.novanadeje.app.donations.domain.donor.SymbolClaimId;
import cz.novanadeje.app.donations.domain.donor.SymbolClaimNotConfirmed;
import cz.novanadeje.app.donations.domain.donor.SymbolClaimNotFound;
import cz.novanadeje.app.donations.domain.donor.SymbolClaimRepository;
import cz.novanadeje.app.donations.domain.donor.SymbolClaimStillConfirmed;
import cz.novanadeje.app.donations.domain.receipt.DonationReceiptRepository;
import cz.novanadeje.app.shared.application.event.AdminActionPerformed;
import cz.novanadeje.app.shared.domain.UuidV7;
import cz.novanadeje.app.shared.domain.VariableSymbol;
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
import java.util.Map;
import java.util.Optional;
import java.util.Set;
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

class AdminSymbolClaimsServiceTest {

    private static final Instant ANSWERED = Instant.parse("2026-10-20T09:00:00Z");
    private static final Instant NOW = Instant.parse("2026-10-22T09:00:00Z");
    private static final UUID ADMIN = UuidV7.generate(NOW);
    private static final SenderAccount ACCOUNT = new SenderAccount("1234567", "0800");
    private static final VariableSymbol OLD_SYMBOL = new VariableSymbol("6123456789");

    private final DonorRecord janaRecord = jana();
    private final DonorReference janaId = janaRecord.id();
    private final SymbolClaim confirmed = SymbolClaim.answer(SymbolClaimId.newId(ANSWERED), janaId, ACCOUNT, OLD_SYMBOL, SymbolClaimAnswer.CONFIRMED,
            ANSWERED);
    private final SymbolClaim declined = SymbolClaim.answer(SymbolClaimId.newId(ANSWERED.plusSeconds(1)), janaId, ACCOUNT,
            new VariableSymbol("5123456789"), SymbolClaimAnswer.DECLINED, ANSWERED.plusSeconds(1));
    private final SenderAccountLinkId link = SenderAccountLinkId.newId(ANSWERED);
    private final BankPayment march = payment(9002, LocalDate.of(2025, 3, 15), czk(50000), Optional.of(ACCOUNT), OLD_SYMBOL.value());
    private final BankPayment september = payment(9003, LocalDate.of(2026, 9, 15), czk(50000), Optional.of(ACCOUNT), OLD_SYMBOL.value());
    private final Donation marchDonation = Donation.pairedByConfirmedSymbol(DonationId.newId(ANSWERED), janaId, march, link, confirmed.id(), ANSWERED);
    private final Donation septemberDonation = Donation.pairedByConfirmedSymbol(DonationId.newId(ANSWERED.plusMillis(1)), janaId, september, link,
            confirmed.id(), ANSWERED);

    private final SymbolClaimRepository claims = mock(SymbolClaimRepository.class);
    private final DonationRepository donations = mock(DonationRepository.class);
    private final DonorRecordRepository donorRecords = mock(DonorRecordRepository.class);
    private final DonationReceiptRepository receipts = mock(DonationReceiptRepository.class);
    private final PairingLock lock = mock(PairingLock.class);
    private final ApplicationEventPublisher events = mock(ApplicationEventPublisher.class);
    private final AdminSymbolClaimsService service = new AdminSymbolClaimsService(claims, donations, donorRecords, receipts, lock, events,
            Clock.fixed(NOW, ZoneOffset.UTC));

    @BeforeEach
    void twoClaimsAreStored() {
        when(claims.findById(confirmed.id())).thenReturn(Optional.of(confirmed));
        when(claims.findById(declined.id())).thenReturn(Optional.of(declined));
        when(donations.findBySymbolClaim(confirmed.id())).thenReturn(List.of(marchDonation, septemberDonation));
        when(receipts.findDonationsWithReceipt(any())).thenReturn(Set.of());
    }

    @Test
    @DisplayName("Given claims of a donor and one of a donor whose record is gone, when listed, then each comes with its donor and the count of donations it paired")
    void should_list_claims_with_donor_and_donation_count_when_listed_given_two_claims() {
        DonorReference gone = new DonorReference(UuidV7.generate(NOW));
        SymbolClaim orphan = SymbolClaim.answer(SymbolClaimId.newId(NOW), gone, ACCOUNT, OLD_SYMBOL, SymbolClaimAnswer.CONFIRMED, NOW);
        when(claims.findAllNewestFirst()).thenReturn(List.of(orphan, declined, confirmed));
        when(donorRecords.findByIds(List.of(gone, janaId))).thenReturn(List.of(janaRecord));
        when(donations.countBySymbolClaims(List.of(orphan.id(), declined.id(), confirmed.id()))).thenReturn(Map.of(confirmed.id(), 2L));

        List<SymbolClaimView> listed = service.list();

        assertThat(listed).extracting(view -> view.claim().id()).containsExactly(orphan.id(), declined.id(), confirmed.id());
        assertThat(listed.get(0).donor()).isEmpty();
        assertThat(listed.get(0).donationCount()).isZero();
        assertThat(listed.get(1).donor()).contains(janaRecord);
        assertThat(listed.get(1).donationCount()).isZero();
        assertThat(listed.get(2).donor()).contains(janaRecord);
        assertThat(listed.get(2).donationCount()).isEqualTo(2);
    }

    @Test
    @DisplayName("Given a confirmed claim whose donations no receipt covers, when reversed, then the lock and the donor row are taken first, the donations are deleted, the answer becomes DECLINED now and the action is audited")
    void should_delete_donations_and_decline_when_reversed_given_uncovered_confirmed_claim() {
        when(receipts.existsYearlyIssuedSince(any(), any(), any())).thenReturn(false);

        service.reverse(ADMIN, confirmed.id());

        InOrder order = inOrder(lock, receipts, donations, claims, events);
        order.verify(lock).acquire();
        order.verify(receipts).lockDonor(janaId);
        order.verify(donations).delete(marchDonation.id());
        order.verify(donations).delete(septemberDonation.id());
        ArgumentCaptor<SymbolClaim> saved = ArgumentCaptor.forClass(SymbolClaim.class);
        order.verify(claims).save(saved.capture());
        assertThat(saved.getValue().id()).isEqualTo(confirmed.id());
        assertThat(saved.getValue().answer()).isEqualTo(SymbolClaimAnswer.DECLINED);
        assertThat(saved.getValue().answeredAt()).isEqualTo(NOW);
        ArgumentCaptor<AdminActionPerformed> audited = ArgumentCaptor.forClass(AdminActionPerformed.class);
        order.verify(events).publishEvent(audited.capture());
        assertThat(audited.getValue().adminId()).isEqualTo(ADMIN);
        assertThat(audited.getValue().action()).isEqualTo("REVERSE_SYMBOL_CLAIM");
        assertThat(audited.getValue().subjectId()).contains(confirmed.id().value());
        assertThat(audited.getValue().details()).contains(confirmed.id().toString(), janaId.toString(), OLD_SYMBOL.value(), "2 donation(s)")
                .doesNotContain("Jana", "1234567/0800");
        assertThat(audited.getValue().performedAt()).isEqualTo(NOW);
        verify(receipts).existsYearlyIssuedSince(janaId, Year.of(2025), ANSWERED);
        verify(receipts).existsYearlyIssuedSince(janaId, Year.of(2026), ANSWERED);
    }

    @Test
    @DisplayName("Given a confirmed claim with a single receipt issued for one of its donations, when reversed, then it is refused and nothing is deleted or saved")
    void should_refuse_when_reversed_given_single_receipt_of_claimed_donation() {
        when(receipts.findDonationsWithReceipt(List.of(marchDonation.id(), septemberDonation.id()))).thenReturn(Set.of(septemberDonation.id()));

        assertThatThrownBy(() -> service.reverse(ADMIN, confirmed.id())).isInstanceOf(SymbolClaimHasReceipt.class);

        verify(donations, never()).delete(any());
        verify(claims, never()).save(any());
        verify(events, never()).publishEvent(any());
    }

    @Test
    @DisplayName("Given a confirmed claim and a yearly receipt of a donation's year issued after the donation was paired, when reversed, then it is refused")
    void should_refuse_when_reversed_given_yearly_receipt_issued_after_claimed_donation() {
        when(receipts.existsYearlyIssuedSince(janaId, Year.of(2025), ANSWERED)).thenReturn(false);
        when(receipts.existsYearlyIssuedSince(janaId, Year.of(2026), ANSWERED)).thenReturn(true);

        assertThatThrownBy(() -> service.reverse(ADMIN, confirmed.id())).isInstanceOf(SymbolClaimHasReceipt.class);

        verify(donations, never()).delete(any());
        verify(claims, never()).save(any());
    }

    @Test
    @DisplayName("Given a declined claim, when reversed, then it is refused because only a confirmed answer can be reversed")
    void should_refuse_when_reversed_given_declined_claim() {
        assertThatThrownBy(() -> service.reverse(ADMIN, declined.id())).isInstanceOf(SymbolClaimNotConfirmed.class);

        verify(claims, never()).save(any());
        verify(events, never()).publishEvent(any());
    }

    @Test
    @DisplayName("Given an unknown claim id, when reversed or reset, then it is not found")
    void should_not_find_when_reversed_or_reset_given_unknown_claim() {
        SymbolClaimId unknown = SymbolClaimId.newId(NOW);
        when(claims.findById(unknown)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.reverse(ADMIN, unknown)).isInstanceOf(SymbolClaimNotFound.class);
        assertThatThrownBy(() -> service.reset(ADMIN, unknown)).isInstanceOf(SymbolClaimNotFound.class);
    }

    @Test
    @DisplayName("Given a declined claim, when reset, then the lock is taken, the claim is deleted and the action is audited")
    void should_delete_claim_and_audit_when_reset_given_declined_claim() {
        service.reset(ADMIN, declined.id());

        InOrder order = inOrder(lock, claims, events);
        order.verify(lock).acquire();
        order.verify(claims).delete(declined.id());
        ArgumentCaptor<AdminActionPerformed> audited = ArgumentCaptor.forClass(AdminActionPerformed.class);
        order.verify(events).publishEvent(audited.capture());
        assertThat(audited.getValue().action()).isEqualTo("RESET_SYMBOL_CLAIM");
        assertThat(audited.getValue().subjectId()).contains(declined.id().value());
        assertThat(audited.getValue().details()).contains(declined.id().toString(), "5123456789").doesNotContain("Jana");
        verify(donations, never()).delete(any());
    }

    @Test
    @DisplayName("Given a confirmed claim, when reset, then it is refused because the confirmed answer has to be reversed first")
    void should_refuse_when_reset_given_confirmed_claim() {
        assertThatThrownBy(() -> service.reset(ADMIN, confirmed.id())).isInstanceOf(SymbolClaimStillConfirmed.class);

        verify(claims, never()).delete(any());
        verify(events, never()).publishEvent(any());
    }
}

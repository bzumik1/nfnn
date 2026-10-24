package cz.novanadeje.app.donations.application.admin;

import cz.novanadeje.app.donations.application.bankaccount.DonorBankAccountsService;
import cz.novanadeje.app.donations.application.overview.DonorDonationsService;
import cz.novanadeje.app.donations.application.pairing.PairingLock;
import cz.novanadeje.app.donations.domain.bank.BankPayment;
import cz.novanadeje.app.donations.domain.bank.SenderAccount;
import cz.novanadeje.app.donations.domain.donation.Donation;
import cz.novanadeje.app.donations.domain.donation.DonationId;
import cz.novanadeje.app.donations.domain.donation.DonationRepository;
import cz.novanadeje.app.donations.domain.donor.DonorRecord;
import cz.novanadeje.app.donations.domain.donor.DonorRecordNotFound;
import cz.novanadeje.app.donations.domain.donor.DonorRecordRepository;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.donations.domain.donor.ExcludedSenderAccounts;
import cz.novanadeje.app.donations.domain.donor.SenderAccountLink;
import cz.novanadeje.app.donations.domain.donor.SenderAccountLinkHasReceipt;
import cz.novanadeje.app.donations.domain.donor.SenderAccountLinkId;
import cz.novanadeje.app.donations.domain.donor.SenderAccountLinkNotFound;
import cz.novanadeje.app.donations.domain.donor.SymbolClaim;
import cz.novanadeje.app.donations.domain.donor.SymbolClaimAnswer;
import cz.novanadeje.app.donations.domain.donor.SymbolClaimId;
import cz.novanadeje.app.donations.domain.donor.SymbolClaimRepository;
import cz.novanadeje.app.donations.domain.receipt.DonationReceiptRepository;
import cz.novanadeje.app.shared.application.event.AdminActionPerformed;
import cz.novanadeje.app.shared.domain.LocaleCode;
import cz.novanadeje.app.shared.domain.PostalAddress;
import cz.novanadeje.app.shared.domain.UuidV7;
import cz.novanadeje.app.shared.domain.VariableSymbol;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import static cz.novanadeje.app.donations.BankPayments.payment;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AdminDonorAccountsServiceTest {

    private static final Instant NOW = Instant.parse("2026-10-22T21:00:00Z");
    private static final UUID ADMIN = UuidV7.generate(NOW.minusSeconds(500));
    private static final DonorReference PETR = new DonorReference(UuidV7.generate(NOW.minusSeconds(400)));
    private static final SenderAccount ACCOUNT = new SenderAccount("2900233333", "2010");
    private static final SenderAccount OTHER_ACCOUNT = new SenderAccount("1234567", "0800");
    private static final VariableSymbol SYMBOL = new VariableSymbol("7310945528");

    @Mock
    private DonorRecordRepository donorRecords;
    @Mock
    private DonationRepository donations;
    @Mock
    private DonationReceiptRepository receipts;
    @Mock
    private SymbolClaimRepository claims;
    @Mock
    private DonorBankAccountsService bankAccounts;
    @Mock
    private DonorDonationsService donorDonations;
    @Mock
    private PairingLock lock;
    @Mock
    private ApplicationEventPublisher events;

    private AdminDonorAccountsService service;

    @BeforeEach
    void setUp() {
        service = new AdminDonorAccountsService(donorRecords, donations, receipts, claims, bankAccounts, donorDonations, lock, events,
                Clock.fixed(NOW, ZoneOffset.UTC));
    }

    @Test
    @DisplayName("Given a learned account with two donations and answers about two accounts, when the link is removed, then the lock comes first, the donations and only that account's answers are deleted, the link row goes and the action is recorded")
    void should_delete_donations_answers_and_link_in_order_when_removed_given_learned_account() {
        DonorRecord petr = record();
        SenderAccountLink link = learn(petr);
        Donation first = Donation.pairedBySenderAccount(DonationId.newId(NOW), PETR, payment(1002, Optional.of(ACCOUNT), null), link.id(), NOW);
        Donation second = Donation.pairedBySenderAccount(DonationId.newId(NOW.plusMillis(1)), PETR, payment(1003, Optional.of(ACCOUNT), null), link.id(), NOW);
        SymbolClaim about = SymbolClaim.answer(SymbolClaimId.newId(NOW), PETR, ACCOUNT, new VariableSymbol("6123456789"), SymbolClaimAnswer.CONFIRMED, NOW);
        SymbolClaim other = SymbolClaim.answer(SymbolClaimId.newId(NOW), PETR, OTHER_ACCOUNT, new VariableSymbol("6123456780"), SymbolClaimAnswer.DECLINED, NOW);
        when(donorRecords.findById(PETR)).thenReturn(Optional.of(petr));
        when(donations.findBySenderAccountLink(link.id())).thenReturn(List.of(first, second));
        when(receipts.findDonationsWithReceipt(anyCollection())).thenReturn(Set.of());
        when(receipts.existsYearlyIssuedSince(any(), any(), any())).thenReturn(false);
        when(claims.findByDonor(PETR)).thenReturn(List.of(about, other));

        service.remove(ADMIN, PETR, link.id());

        InOrder order = inOrder(lock, receipts, donations, claims, donorRecords, events);
        order.verify(lock).acquire();
        order.verify(receipts).lockDonor(PETR);
        order.verify(donations).delete(first.id());
        order.verify(donations).delete(second.id());
        order.verify(claims).delete(about.id());
        order.verify(donorRecords).deleteSenderAccountLink(PETR, link.id());
        verify(claims, never()).delete(other.id());
        assertThat(petr.senderAccountLinks()).isEmpty();
        ArgumentCaptor<Object> published = ArgumentCaptor.forClass(Object.class);
        order.verify(events).publishEvent(published.capture());
        AdminActionPerformed action = (AdminActionPerformed) published.getValue();
        assertThat(action.adminId()).isEqualTo(ADMIN);
        assertThat(action.action()).isEqualTo("REMOVE_SENDER_ACCOUNT_LINK");
        assertThat(action.subjectId()).contains(PETR.value());
        assertThat(action.details()).contains("2900233333/2010").contains("smazané dary spárované přes něj: 2").contains("smazané odpovědi o starších symbolech: 1");
        assertThat(action.performedAt()).isEqualTo(NOW);
    }

    @Test
    @DisplayName("Given a donation paired through the link that a receipt covers, when the link is removed, then it is refused and nothing is deleted or recorded")
    void should_refuse_and_delete_nothing_when_removed_given_receipted_donation() {
        DonorRecord petr = record();
        SenderAccountLink link = learn(petr);
        Donation receipted = Donation.pairedBySenderAccount(DonationId.newId(NOW), PETR, payment(1002, Optional.of(ACCOUNT), null), link.id(), NOW);
        when(donorRecords.findById(PETR)).thenReturn(Optional.of(petr));
        when(donations.findBySenderAccountLink(link.id())).thenReturn(List.of(receipted));
        when(receipts.findDonationsWithReceipt(anyCollection())).thenReturn(Set.of(receipted.id()));

        assertThatThrownBy(() -> service.remove(ADMIN, PETR, link.id())).isInstanceOf(SenderAccountLinkHasReceipt.class);

        verify(donations, never()).delete(any());
        verify(claims, never()).delete(any());
        verify(donorRecords, never()).deleteSenderAccountLink(any(), any());
        verify(events, never()).publishEvent(any());
        assertThat(petr.senderAccountLinks()).hasSize(1);
    }

    @Test
    @DisplayName("Given a donor without such a link, when the link is removed, then it is not found and nothing is touched")
    void should_refuse_when_removed_given_unknown_link() {
        when(donorRecords.findById(PETR)).thenReturn(Optional.of(record()));

        assertThatThrownBy(() -> service.remove(ADMIN, PETR, SenderAccountLinkId.newId(NOW))).isInstanceOf(SenderAccountLinkNotFound.class);

        verify(donations, never()).delete(any());
        verify(events, never()).publishEvent(any());
    }

    @Test
    @DisplayName("Given no record of the donor, when the card is viewed or an account is disconnected, then the donor is not found")
    void should_refuse_when_viewed_or_disconnected_given_unknown_donor() {
        when(donorRecords.findById(PETR)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.view(PETR)).isInstanceOf(DonorRecordNotFound.class);
        assertThatThrownBy(() -> service.disconnect(ADMIN, PETR, SenderAccountLinkId.newId(NOW))).isInstanceOf(DonorRecordNotFound.class);
        verify(events, never()).publishEvent(any());
    }

    private static DonorRecord record() {
        return DonorRecord.registerPerson(PETR, "Petr Svoboda", new PostalAddress("Dlouhá 12", "Ústí nad Labem", "400 01"), SYMBOL, LocaleCode.CS,
                NOW.minusSeconds(300));
    }

    private static SenderAccountLink learn(DonorRecord record) {
        BankPayment proof = payment(1001, Optional.of(ACCOUNT), SYMBOL.value());
        return record.learnSenderAccountFrom(proof, Optional.empty(), ExcludedSenderAccounts.none(), NOW.minusSeconds(200)).orElseThrow();
    }
}

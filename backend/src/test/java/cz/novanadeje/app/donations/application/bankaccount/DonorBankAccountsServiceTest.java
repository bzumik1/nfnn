package cz.novanadeje.app.donations.application.bankaccount;

import cz.novanadeje.app.donations.domain.bank.BankPaymentId;
import cz.novanadeje.app.donations.domain.bank.SenderAccount;
import cz.novanadeje.app.donations.domain.donation.Donation;
import cz.novanadeje.app.donations.domain.donation.DonationId;
import cz.novanadeje.app.donations.domain.donation.DonationRepository;
import cz.novanadeje.app.donations.domain.donation.DonationSource;
import cz.novanadeje.app.donations.domain.donation.DonationStatus;
import cz.novanadeje.app.donations.domain.donation.PairingMethod;
import cz.novanadeje.app.donations.domain.donor.DonorRecord;
import cz.novanadeje.app.donations.domain.donor.DonorRecordRepository;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.donations.domain.donor.SenderAccountAlreadyConnected;
import cz.novanadeje.app.donations.domain.donor.SenderAccountLink;
import cz.novanadeje.app.donations.domain.donor.SenderAccountLinkId;
import cz.novanadeje.app.donations.domain.donor.SenderAccountLinkNotFound;
import cz.novanadeje.app.donations.domain.donor.SenderAccountLinkStatus;
import cz.novanadeje.app.shared.domain.DonorType;
import cz.novanadeje.app.shared.domain.LocaleCode;
import cz.novanadeje.app.shared.domain.Money;
import cz.novanadeje.app.shared.domain.PostalAddress;
import cz.novanadeje.app.shared.domain.UuidV7;
import cz.novanadeje.app.shared.domain.VariableSymbol;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class DonorBankAccountsServiceTest {

    private static final Instant NOW = Instant.parse("2026-10-17T22:30:00Z");
    private static final LocalDate PRAGUE_TODAY = LocalDate.of(2026, 10, 18);
    private static final SenderAccount ACCOUNT = new SenderAccount("2900233333", "2010");
    private static final SenderAccount OTHER_ACCOUNT = new SenderAccount("1234567", "0800");
    private static final DonorReference JANA = new DonorReference(UuidV7.generate(NOW));
    private static final DonorReference PETR = new DonorReference(UuidV7.generate(NOW.plusSeconds(1)));

    private final DonorRecordRepository donorRecords = mock(DonorRecordRepository.class);
    private final DonationRepository donations = mock(DonationRepository.class);
    private final DonorBankAccountsService service = new DonorBankAccountsService(donorRecords, donations, Clock.fixed(NOW, ZoneOffset.UTC));

    @Test
    @DisplayName("Given links and donations paired through them, when listed, then live links come first, newest first, with their received donations counted")
    void should_list_live_links_first_with_counts_when_listed_given_links_and_donations() {
        SenderAccountLink older = active(ACCOUNT, NOW.minusSeconds(7200));
        SenderAccountLink newer = active(OTHER_ACCOUNT, NOW.minusSeconds(3600));
        SenderAccountLink ended = disconnected(new SenderAccount("19-2000145399", "0800"), NOW.minusSeconds(1));
        when(donorRecords.findById(JANA)).thenReturn(Optional.of(record(JANA, older, newer, ended)));
        when(donorRecords.findBySenderAccount(any())).thenReturn(List.of());
        when(donations.findByDonorNewestFirst(JANA)).thenReturn(List.of(
                through(older, LocalDate.of(2026, 10, 12), 30000, DonationStatus.RECEIVED),
                through(older, LocalDate.of(2026, 10, 5), 20000, DonationStatus.RECEIVED),
                through(older, LocalDate.of(2026, 10, 14), 99900, DonationStatus.REFUNDED)));

        List<BankAccountView> views = service.listBankAccounts(JANA);

        assertThat(views).extracting(view -> view.link().id()).containsExactly(newer.id(), older.id(), ended.id());
        BankAccountView olderView = views.get(1);
        assertThat(olderView.donationCount()).isEqualTo(2);
        assertThat(olderView.total()).isEqualTo(Money.czk(50000));
        assertThat(olderView.lastDonationOn()).contains(LocalDate.of(2026, 10, 12));
        assertThat(views.getFirst().donationCount()).isZero();
        assertThat(views.getFirst().lastDonationOn()).isEmpty();
        assertThat(olderView.verifiedOn()).contains(LocalDate.of(2026, 10, 17));
    }

    @Test
    @DisplayName("Given an active link another donor also uses, when listed, then it is shared, and a disconnected one never is")
    void should_mark_shared_when_listed_given_account_another_donor_uses() {
        SenderAccountLink link = active(ACCOUNT, NOW);
        DonorRecord jana = record(JANA, link);
        when(donorRecords.findById(JANA)).thenReturn(Optional.of(jana));
        when(donorRecords.findBySenderAccount(ACCOUNT)).thenReturn(List.of(jana, record(PETR, active(ACCOUNT, NOW))));
        when(donations.findByDonorNewestFirst(JANA)).thenReturn(List.of());

        assertThat(service.listBankAccounts(JANA)).singleElement().satisfies(view -> assertThat(view.shared()).isTrue());

        when(donorRecords.findBySenderAccount(ACCOUNT)).thenReturn(List.of(jana, record(PETR, disconnected(ACCOUNT, NOW))));
        assertThat(service.listBankAccounts(JANA)).singleElement().satisfies(view -> assertThat(view.shared()).isFalse());
    }

    @Test
    @DisplayName("Given a donor without a record, when listed, then the list is empty")
    void should_list_nothing_when_listed_given_no_record() {
        assertThat(service.listBankAccounts(JANA)).isEmpty();
    }

    @Test
    @DisplayName("Given an active link, when disconnected at 23:30 UTC, then it ends on the Prague day and is saved")
    void should_end_on_prague_day_when_disconnected_given_active_link() {
        SenderAccountLink link = active(ACCOUNT, NOW.minusSeconds(3600));
        when(donorRecords.findById(JANA)).thenReturn(Optional.of(record(JANA, link)));

        service.disconnect(JANA, link.id());

        ArgumentCaptor<SenderAccountLink> saved = ArgumentCaptor.forClass(SenderAccountLink.class);
        verify(donorRecords).saveSenderAccountLink(eq(JANA), saved.capture());
        assertThat(saved.getValue().status()).isEqualTo(SenderAccountLinkStatus.DISCONNECTED);
        assertThat(saved.getValue().validTo()).contains(PRAGUE_TODAY);
    }

    @Test
    @DisplayName("Given a donor without a record or without that link, when disconnected or reconnected, then it is not found and nothing is saved")
    void should_not_find_when_disconnected_given_unknown_link() {
        SenderAccountLinkId unknown = SenderAccountLinkId.newId(NOW);

        assertThatThrownBy(() -> service.disconnect(JANA, unknown)).isInstanceOf(SenderAccountLinkNotFound.class);
        assertThatThrownBy(() -> service.reconnect(JANA, unknown)).isInstanceOf(SenderAccountLinkNotFound.class);
        when(donorRecords.findById(JANA)).thenReturn(Optional.of(record(JANA, active(ACCOUNT, NOW))));
        assertThatThrownBy(() -> service.disconnect(JANA, unknown)).isInstanceOf(SenderAccountLinkNotFound.class);
        verify(donorRecords, never()).saveSenderAccountLink(any(), any());
    }

    @Test
    @DisplayName("Given a disconnected link, when reconnected, then a link awaiting a payment from the Prague day is saved")
    void should_save_awaiting_link_when_reconnected_given_disconnected_link() {
        SenderAccountLink link = disconnected(ACCOUNT, NOW.minusSeconds(3600));
        when(donorRecords.findById(JANA)).thenReturn(Optional.of(record(JANA, link)));
        when(donorRecords.saveSenderAccountLink(eq(JANA), any())).thenReturn(true);

        service.reconnect(JANA, link.id());

        ArgumentCaptor<SenderAccountLink> saved = ArgumentCaptor.forClass(SenderAccountLink.class);
        verify(donorRecords).saveSenderAccountLink(eq(JANA), saved.capture());
        assertThat(saved.getValue().status()).isEqualTo(SenderAccountLinkStatus.AWAITING_PAYMENT);
        assertThat(saved.getValue().validFrom()).contains(PRAGUE_TODAY);
    }

    @Test
    @DisplayName("Given a reconnect that loses a race with another one, when the insert is ignored, then it is a conflict")
    void should_conflict_when_reconnected_given_concurrent_reconnect() {
        SenderAccountLink link = disconnected(ACCOUNT, NOW.minusSeconds(3600));
        when(donorRecords.findById(JANA)).thenReturn(Optional.of(record(JANA, link)));

        assertThatThrownBy(() -> service.reconnect(JANA, link.id())).isInstanceOf(SenderAccountAlreadyConnected.class);
    }

    private static SenderAccountLink active(SenderAccount account, Instant at) {
        return SenderAccountLink.reconstitute(SenderAccountLinkId.newId(at), account, SenderAccountLinkStatus.ACTIVE,
                Optional.of(BankPaymentId.newId(at)), Optional.of(at), Optional.empty(), Optional.empty(), at, Optional.empty());
    }

    private static SenderAccountLink disconnected(SenderAccount account, Instant at) {
        return SenderAccountLink.reconstitute(SenderAccountLinkId.newId(at), account, SenderAccountLinkStatus.DISCONNECTED,
                Optional.of(BankPaymentId.newId(at)), Optional.of(at), Optional.empty(), Optional.of(LocalDate.of(2026, 10, 1)), at,
                Optional.of(at));
    }

    private static DonorRecord record(DonorReference id, SenderAccountLink... links) {
        return DonorRecord.reconstitute(id, DonorType.PERSON, "Jana Nováková", null, new PostalAddress("Dlouhá 12", "Ústí nad Labem", "400 01"),
                new VariableSymbol("4821937560"), LocaleCode.CS, List.of(links), NOW, NOW);
    }

    private static Donation through(SenderAccountLink link, LocalDate receivedOn, long amountMinor, DonationStatus status) {
        return Donation.reconstitute(DonationId.newId(NOW), JANA, Optional.of(BankPaymentId.newId(NOW)), receivedOn, Money.czk(amountMinor),
                DonationSource.BANK_TRANSFER, status, Optional.of(PairingMethod.SENDER_ACCOUNT), Optional.of(link.id()), NOW);
    }
}

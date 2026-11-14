package cz.novanadeje.app.donations.infrastructure.persistence;

import cz.novanadeje.app.PersistenceTest;
import cz.novanadeje.app.donations.domain.bank.BankPayment;
import cz.novanadeje.app.donations.domain.bank.BankPaymentRepository;
import cz.novanadeje.app.donations.domain.bank.SenderAccount;
import cz.novanadeje.app.donations.domain.donation.Donation;
import cz.novanadeje.app.donations.domain.donation.DonationId;
import cz.novanadeje.app.donations.domain.donation.DonationRepository;
import cz.novanadeje.app.donations.domain.donation.PairingMethod;
import cz.novanadeje.app.donations.domain.donor.DonorRecord;
import cz.novanadeje.app.donations.domain.donor.DonorRecordRepository;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.donations.domain.donor.SenderAccountLink;
import cz.novanadeje.app.donations.domain.donor.SenderAccountLinkId;
import cz.novanadeje.app.donations.domain.donor.SymbolClaim;
import cz.novanadeje.app.donations.domain.donor.SymbolClaimAnswer;
import cz.novanadeje.app.donations.domain.donor.SymbolClaimId;
import cz.novanadeje.app.donations.domain.donor.SymbolClaimRepository;
import cz.novanadeje.app.shared.application.event.LiveFeed;
import cz.novanadeje.app.shared.application.event.StoredDataChanged;
import cz.novanadeje.app.shared.domain.LocaleCode;
import cz.novanadeje.app.shared.domain.Money;
import cz.novanadeje.app.shared.domain.PostalAddress;
import cz.novanadeje.app.shared.domain.UuidV7;
import cz.novanadeje.app.shared.domain.VariableSymbol;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.event.ApplicationEvents;
import org.springframework.test.context.event.RecordApplicationEvents;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import static cz.novanadeje.app.donations.BankPayments.payment;
import static cz.novanadeje.app.donations.infrastructure.persistence.BankPersistenceTestConfiguration.NOW;
import static org.assertj.core.api.Assertions.assertThat;

@PersistenceTest
@RecordApplicationEvents
class RepositoryLiveHintsTest {

    private static final Optional<SenderAccount> ACCOUNT = Optional.of(new SenderAccount("2900233333", "2010"));

    @Autowired
    private DonationRepository donations;
    @Autowired
    private DonorRecordRepository donorRecords;
    @Autowired
    private BankPaymentRepository payments;
    @Autowired
    private SymbolClaimRepository claims;
    @Autowired
    private ApplicationEvents events;

    @Test
    @DisplayName("Given a stored payment, when a donation of it is saved and deleted, then each change hints the donor's donations and the payments, whose pairing it is")
    void should_hint_donor_donations_and_payments_when_donation_saved_and_deleted_given_stored_payment() {
        DonorReference jana = storedDonor("4821937560");
        BankPayment stored = storedPayment(1001);
        Donation donation = Donation.fromBankPayment(DonationId.newId(NOW), jana, stored, PairingMethod.VARIABLE_SYMBOL, NOW);
        events.clear();

        donations.save(donation);
        donations.delete(donation.id());

        StoredDataChanged gifts = StoredDataChanged.ofDonor(LiveFeed.DONATIONS, jana.value());
        StoredDataChanged pairings = StoredDataChanged.of(LiveFeed.PAYMENTS);
        assertThat(hints()).containsExactly(gifts, pairings, gifts, pairings);
    }

    @Test
    @DisplayName("Given new bank payments, when they are saved, then one hint of the payments feed goes out, and none for an empty batch")
    void should_hint_payments_once_when_saved_given_new_payments() {
        payments.saveAll(List.of());
        payments.saveAll(List.of(payment(2001, LocalDate.of(2026, 10, 15), Money.czk(100), ACCOUNT, null),
                payment(2002, LocalDate.of(2026, 10, 15), Money.czk(200), ACCOUNT, null)));

        assertThat(hints()).containsExactly(StoredDataChanged.of(LiveFeed.PAYMENTS));
    }

    @Test
    @DisplayName("Given a donor, when an account link is saved and removed and a symbol claim answered, then each change hints the donor's bank accounts")
    void should_hint_donor_bank_accounts_when_links_and_claims_change_given_donor() {
        DonorReference jana = storedDonor("4821937560");
        SenderAccountLink link = SenderAccountLink.awaitingPayment(SenderAccountLinkId.newId(NOW), ACCOUNT.orElseThrow(), LocalDate.of(2026, 10, 1), NOW);
        SymbolClaim claim = SymbolClaim.answer(SymbolClaimId.newId(NOW), jana, ACCOUNT.orElseThrow(), new VariableSymbol("6123456789"),
                SymbolClaimAnswer.CONFIRMED, NOW);
        events.clear();

        donorRecords.saveSenderAccountLink(jana, link);
        donorRecords.deleteSenderAccountLink(jana, link.id());
        claims.saveIfAbsent(claim);

        StoredDataChanged accounts = StoredDataChanged.ofDonor(LiveFeed.BANK_ACCOUNTS, jana.value());
        assertThat(hints()).containsExactly(accounts, accounts, accounts);
    }

    @Test
    @DisplayName("Given a donor, when a link is saved again, a duplicate link and an answered claim come again, claims change and every link goes, then each stored change hints the donor's bank accounts and the ignored ones send nothing")
    void should_hint_only_stored_changes_when_links_and_claims_repeat_given_donor() {
        DonorReference jana = storedDonor("4821937560");
        SenderAccountLink link = SenderAccountLink.awaitingPayment(SenderAccountLinkId.newId(NOW), ACCOUNT.orElseThrow(), LocalDate.of(2026, 10, 1), NOW);
        SymbolClaim claim = SymbolClaim.answer(SymbolClaimId.newId(NOW), jana, ACCOUNT.orElseThrow(), new VariableSymbol("6123456789"),
                SymbolClaimAnswer.CONFIRMED, NOW);
        donorRecords.saveSenderAccountLink(jana, link);
        claims.saveIfAbsent(claim);
        events.clear();

        donorRecords.saveSenderAccountLink(jana, link);
        boolean duplicateSaved = donorRecords.saveSenderAccountLink(jana,
                SenderAccountLink.awaitingPayment(SenderAccountLinkId.newId(NOW), ACCOUNT.orElseThrow(), LocalDate.of(2026, 10, 1), NOW));
        boolean answeredAgain = claims.saveIfAbsent(SymbolClaim.answer(SymbolClaimId.newId(NOW), jana, ACCOUNT.orElseThrow(),
                new VariableSymbol("6123456789"), SymbolClaimAnswer.CONFIRMED, NOW));
        claims.save(claim);
        claims.delete(claim.id());
        donorRecords.deleteSenderAccountLinksOf(jana);

        assertThat(duplicateSaved).isFalse();
        assertThat(answeredAgain).isFalse();
        StoredDataChanged accounts = StoredDataChanged.ofDonor(LiveFeed.BANK_ACCOUNTS, jana.value());
        assertThat(hints()).containsExactly(accounts, accounts, accounts, accounts);
    }

    private List<StoredDataChanged> hints() {
        return events.stream(StoredDataChanged.class).toList();
    }

    private DonorReference storedDonor(String symbol) {
        DonorRecord record = DonorRecord.registerPerson(new DonorReference(UuidV7.generate(NOW)), "Jana Nováková",
                new PostalAddress("Dlouhá 12", "Ústí nad Labem", "400 01"), new VariableSymbol(symbol), LocaleCode.CS, NOW);
        donorRecords.save(record);
        return record.id();
    }

    private BankPayment storedPayment(long transactionId) {
        BankPayment payment = payment(transactionId, LocalDate.of(2026, 10, 15), Money.czk(50000), ACCOUNT, null);
        payments.saveAll(List.of(payment));
        return payment;
    }
}

package cz.novanadeje.app.donations.infrastructure.persistence;

import cz.novanadeje.app.donations.domain.bank.BankPayment;
import cz.novanadeje.app.donations.domain.bank.BankPaymentId;
import cz.novanadeje.app.donations.domain.bank.BankPaymentRepository;
import cz.novanadeje.app.donations.domain.bank.SenderAccount;
import cz.novanadeje.app.donations.domain.donation.Donation;
import cz.novanadeje.app.donations.domain.donation.DonationId;
import cz.novanadeje.app.donations.domain.donation.DonationPurpose;
import cz.novanadeje.app.donations.domain.donation.DonationRepository;
import cz.novanadeje.app.donations.domain.donation.DonationSource;
import cz.novanadeje.app.donations.domain.donation.DonationStatus;
import cz.novanadeje.app.donations.domain.donation.PairingMethod;
import cz.novanadeje.app.donations.domain.donor.DonorRecord;
import cz.novanadeje.app.donations.domain.donor.DonorRecordRepository;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.donations.domain.donor.ExcludedSenderAccounts;
import cz.novanadeje.app.donations.domain.donor.SenderAccountLink;
import cz.novanadeje.app.donations.domain.donor.SenderAccountLinkId;
import cz.novanadeje.app.donations.domain.donor.SymbolClaim;
import cz.novanadeje.app.donations.domain.donor.SymbolClaimAnswer;
import cz.novanadeje.app.donations.domain.donor.SymbolClaimId;
import cz.novanadeje.app.donations.domain.donor.SymbolClaimRepository;
import cz.novanadeje.app.shared.domain.LocaleCode;
import cz.novanadeje.app.shared.domain.Money;
import cz.novanadeje.app.shared.domain.PostalAddress;
import cz.novanadeje.app.shared.domain.UuidV7;
import cz.novanadeje.app.shared.domain.VariableSymbol;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.simple.JdbcClient;

import java.time.LocalDate;
import java.time.Year;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static cz.novanadeje.app.donations.BankPayments.payment;
import static cz.novanadeje.app.donations.infrastructure.persistence.BankPersistenceTestConfiguration.NOW;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(BankPersistenceTestConfiguration.class)
class JpaDonationRepositoryTest {

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
    private EntityManager entityManager;
    @Autowired
    private JdbcClient jdbc;

    @Test
    @DisplayName("Given a donation from a bank payment, when it is saved and read back, then every field survives and the payment counts as paired")
    void should_keep_every_field_when_saved_and_read_given_bank_transfer() {
        DonorReference jana = storedDonor("4821937560");
        BankPayment payment = storedPayment(1001, LocalDate.of(2026, 10, 15));
        Donation donation = Donation.fromBankPayment(DonationId.newId(NOW), jana, payment, PairingMethod.SENDER_ACCOUNT, NOW);

        donations.save(donation);
        flushAndClear();

        assertThat(donations.findByDonorNewestFirst(jana)).singleElement().satisfies(stored -> {
            assertThat(stored.id()).isEqualTo(donation.id());
            assertThat(stored.donor()).isEqualTo(jana);
            assertThat(stored.bankPayment()).contains(payment.id());
            assertThat(stored.receivedOn()).isEqualTo(LocalDate.of(2026, 10, 15));
            assertThat(stored.amount()).isEqualTo(Money.czk(50000));
            assertThat(stored.source()).isEqualTo(DonationSource.BANK_TRANSFER);
            assertThat(stored.status()).isEqualTo(DonationStatus.RECEIVED);
            assertThat(stored.pairedBy()).contains(PairingMethod.SENDER_ACCOUNT);
            assertThat(stored.purpose()).isEqualTo(DonationPurpose.GENERAL);
            assertThat(stored.recordedAt()).isEqualTo(NOW);
        });
        assertThat(donations.existsForBankPayment(payment.id())).isTrue();
        assertThat(donations.existsForBankPayment(BankPaymentId.newId(NOW))).isFalse();
    }

    @Test
    @DisplayName("Given donations of two donors, when one donor's donations are listed, then only theirs come, latest receipt first")
    void should_list_only_donor_donations_latest_first_when_listed_given_two_donors() {
        DonorReference jana = storedDonor("4821937560");
        DonorReference petr = storedDonor("7310945528");
        donations.save(bySymbol(jana, storedPayment(1001, LocalDate.of(2026, 10, 10))));
        donations.save(bySymbol(jana, storedPayment(1002, LocalDate.of(2026, 10, 16))));
        donations.save(bySymbol(petr, storedPayment(1003, LocalDate.of(2026, 10, 12))));
        flushAndClear();

        assertThat(donations.findByDonorNewestFirst(jana)).extracting(Donation::receivedOn)
                .containsExactly(LocalDate.of(2026, 10, 16), LocalDate.of(2026, 10, 10));
    }

    @Test
    @DisplayName("Given two donations received on the same day, when listed, then the one recorded later comes first")
    void should_list_later_recorded_first_when_listed_given_same_receipt_day() {
        DonorReference jana = storedDonor("4821937560");
        LocalDate sameDay = LocalDate.of(2026, 10, 15);
        Donation recordedFirst = Donation.fromBankPayment(DonationId.newId(NOW), jana, storedPayment(1001, sameDay),
                PairingMethod.VARIABLE_SYMBOL, NOW);
        Donation recordedLater = Donation.fromBankPayment(DonationId.newId(NOW), jana, storedPayment(1002, sameDay),
                PairingMethod.VARIABLE_SYMBOL, NOW.plusSeconds(60));
        Donation olderDay = Donation.fromBankPayment(DonationId.newId(NOW), jana, storedPayment(1003, sameDay.minusDays(1)),
                PairingMethod.VARIABLE_SYMBOL, NOW.plusSeconds(120));
        donations.save(recordedFirst);
        donations.save(olderDay);
        donations.save(recordedLater);
        flushAndClear();

        assertThat(donations.findByDonorNewestFirst(jana)).extracting(Donation::id)
                .containsExactly(recordedLater.id(), recordedFirst.id(), olderDay.id());
    }

    @Test
    @DisplayName("Given two donations received on the same day and recorded at the same time, when listed, then the one with the newer id comes first")
    void should_list_newer_id_first_when_listed_given_same_receipt_day_and_recording_time() {
        DonorReference jana = storedDonor("4821937560");
        LocalDate sameDay = LocalDate.of(2026, 10, 15);
        Donation olderId = Donation.fromBankPayment(DonationId.newId(NOW), jana, storedPayment(1001, sameDay),
                PairingMethod.VARIABLE_SYMBOL, NOW);
        Donation newerId = Donation.fromBankPayment(DonationId.newId(NOW.plusMillis(1)), jana, storedPayment(1002, sameDay),
                PairingMethod.VARIABLE_SYMBOL, NOW);
        donations.save(olderId);
        donations.save(newerId);
        flushAndClear();

        assertThat(donations.findByDonorNewestFirst(jana)).extracting(Donation::id).containsExactly(newerId.id(), olderId.id());
    }

    @Test
    @DisplayName("Given a paired bank payment, when a second donation for it is saved, then the save itself fails with an integrity violation")
    void should_refuse_when_saved_given_second_donation_for_payment() {
        DonorReference jana = storedDonor("4821937560");
        DonorReference petr = storedDonor("7310945528");
        BankPayment payment = storedPayment(1001, LocalDate.of(2026, 10, 15));
        donations.save(bySymbol(jana, payment));
        flushAndClear();

        assertThatThrownBy(() -> donations.save(bySymbol(petr, payment)))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("uq_donation_bank_payment");
    }

    @Test
    @DisplayName("Given the schema, when a bank transfer without a payment is inserted, then the check constraint refuses it")
    void should_refuse_when_inserted_given_bank_transfer_without_payment() {
        DonorReference jana = storedDonor("4821937560");
        entityManager.flush();

        assertThatThrownBy(() -> jdbc.sql("insert into donation (id, donor_id, received_on, amount_minor, currency, source, status, purpose, recorded_at)"
                        + " values (?, ?, current_date, 100, 'CZK', 'BANK_TRANSFER', 'RECEIVED', 'GENERAL', now())")
                .params(UuidV7.generate(NOW), jana.value()).update())
                .hasMessageContaining("ck_donation_bank_transfer_has_payment");
    }

    @Test
    @DisplayName("Given donations of two donors, when a donation is looked up for a donor, then only the donor's own donation is found")
    void should_find_only_own_donation_when_looked_up_given_two_donors() {
        DonorReference jana = storedDonor("4821937560");
        DonorReference petr = storedDonor("7310945528");
        Donation janas = bySymbol(jana, storedPayment(1001, LocalDate.of(2026, 10, 15)));
        donations.save(janas);
        flushAndClear();

        assertThat(donations.findByIdForDonor(janas.id(), jana)).hasValueSatisfying(found -> {
            assertThat(found.id()).isEqualTo(janas.id());
            assertThat(found.amount()).isEqualTo(Money.czk(50000));
        });
        assertThat(donations.findByIdForDonor(janas.id(), petr)).isEmpty();
        assertThat(donations.findByIdForDonor(DonationId.newId(NOW), jana)).isEmpty();
    }

    @Test
    @DisplayName("Given donations around a period, when donations received in it are asked for, then both boundary days are included and the days outside are not")
    void should_include_boundary_days_when_asked_for_period_given_donations_around_it() {
        DonorReference jana = storedDonor("4821937560");
        donations.save(bySymbol(jana, storedPayment(1001, LocalDate.of(2025, 12, 31))));
        donations.save(bySymbol(jana, storedPayment(1002, LocalDate.of(2026, 1, 1))));
        donations.save(bySymbol(jana, storedPayment(1003, LocalDate.of(2026, 9, 30))));
        donations.save(bySymbol(jana, storedPayment(1004, LocalDate.of(2026, 10, 1))));
        flushAndClear();

        assertThat(donations.findReceivedOnBetween(LocalDate.of(2026, 1, 1), LocalDate.of(2026, 9, 30)))
                .extracting(Donation::receivedOn)
                .containsExactlyInAnyOrder(LocalDate.of(2026, 1, 1), LocalDate.of(2026, 9, 30));
    }

    @Test
    @DisplayName("Given a donation from a payment verifying an account, when it is saved and read back, then it keeps the account verification purpose")
    void should_keep_verification_purpose_when_saved_and_read_given_verification_payment() {
        DonorReference jana = storedDonor("4821937560");
        BankPayment payment = payment(1001, LocalDate.of(2026, 10, 15), Money.czk(100), ACCOUNT, "4821937560",
                "OVERENI UCTU NADACNI FOND NOVA NADEJE");
        payments.saveAll(List.of(payment));

        donations.save(bySymbol(jana, payment));
        flushAndClear();

        assertThat(donations.findByDonorNewestFirst(jana)).singleElement()
                .extracting(Donation::purpose).isEqualTo(DonationPurpose.ACCOUNT_VERIFICATION);
    }

    @Test
    @DisplayName("Given a donation paired by a confirmed symbol, when it is saved and read back, then the method, the link and the claim survive")
    void should_keep_link_and_claim_when_saved_and_read_given_confirmed_symbol_donation() {
        ConfirmedSymbolSetup setup = confirmedSymbolSetup();
        Donation donation = Donation.pairedByConfirmedSymbol(DonationId.newId(NOW), setup.donor(), setup.payment(), setup.link().id(),
                setup.claim().id(), NOW);

        donations.save(donation);
        flushAndClear();

        assertThat(donations.findByDonorNewestFirst(setup.donor())).singleElement().satisfies(stored -> {
            assertThat(stored.pairedBy()).contains(PairingMethod.CONFIRMED_SYMBOL);
            assertThat(stored.pairedThrough()).contains(setup.link().id());
            assertThat(stored.confirmedClaim()).contains(setup.claim().id());
        });
        assertThat(jdbc.sql("select paired_by from donation where id = ?").param(donation.id().value()).query(String.class).single())
                .isEqualTo("CONFIRMED_SYMBOL");
    }

    @ParameterizedTest(name = "{0} with link {1} and claim {2} breaks {3}")
    @CsvSource({
            "CONFIRMED_SYMBOL, false, true, ck_donation_confirmed_symbol_sources",
            "CONFIRMED_SYMBOL, true, false, ck_donation_confirmed_symbol_sources",
            "VARIABLE_SYMBOL, false, true, ck_donation_symbol_claim_pairing",
            "SENDER_ACCOUNT, true, true, ck_donation_symbol_claim_pairing",
            "VARIABLE_SYMBOL, true, false, ck_donation_sender_account_pairing",
            "GUESSED, false, false, ck_donation_paired_by"})
    @DisplayName("Given the schema, when a donation whose method, link and claim do not fit together is inserted, then a check constraint refuses it")
    void should_refuse_when_inserted_given_method_link_and_claim_not_fitting(String pairedBy, boolean withLink, boolean withClaim,
                                                                            String constraint) {
        ConfirmedSymbolSetup setup = confirmedSymbolSetup();
        entityManager.flush();
        UUID link = withLink ? setup.link().id().value() : null;
        UUID claim = withClaim ? setup.claim().id().value() : null;

        assertThatThrownBy(() -> insertDonation(setup, pairedBy, link, claim)).hasMessageContaining(constraint);
    }

    @Test
    @DisplayName("Given the schema, when a donation paired by a confirmed symbol is inserted with neither its link nor its claim, as after the donor's erasure, then it is accepted")
    void should_accept_when_inserted_given_confirmed_symbol_without_link_and_claim() {
        ConfirmedSymbolSetup setup = confirmedSymbolSetup();
        entityManager.flush();

        assertThatCode(() -> insertDonation(setup, "CONFIRMED_SYMBOL", null, null)).doesNotThrowAnyException();
    }

    @Test
    @DisplayName("Given donations paired through two claims and one by symbol, when the donations of a claim and the counts per claim are asked for, then only the claim's donations come, oldest first, and the counts name only claims with donations")
    void should_find_and_count_claim_donations_when_asked_given_mixed_pairings() {
        ConfirmedSymbolSetup setup = confirmedSymbolSetup();
        BankPayment later = payment(1003, LocalDate.of(2026, 10, 20), Money.czk(50000), ACCOUNT, "6123456789");
        BankPayment bySymbolPayment = payment(1004, LocalDate.of(2026, 10, 21), Money.czk(50000), ACCOUNT, "4821937560");
        payments.saveAll(List.of(later, bySymbolPayment));
        SymbolClaim otherClaim = SymbolClaim.answer(SymbolClaimId.newId(NOW.plusSeconds(1)), setup.donor(), ACCOUNT.orElseThrow(),
                new VariableSymbol("5123456789"), SymbolClaimAnswer.CONFIRMED, NOW.plusSeconds(1));
        claims.saveIfAbsent(otherClaim);
        Donation second = Donation.pairedByConfirmedSymbol(DonationId.newId(NOW), setup.donor(), later, setup.link().id(), setup.claim().id(), NOW);
        Donation first = Donation.pairedByConfirmedSymbol(DonationId.newId(NOW.plusMillis(1)), setup.donor(), setup.payment(), setup.link().id(),
                setup.claim().id(), NOW);
        donations.save(second);
        donations.save(first);
        donations.save(bySymbol(setup.donor(), bySymbolPayment));
        flushAndClear();

        assertThat(donations.findBySymbolClaim(setup.claim().id())).extracting(Donation::id).containsExactly(first.id(), second.id());
        assertThat(donations.findBySymbolClaim(otherClaim.id())).isEmpty();
        assertThat(donations.countBySymbolClaims(List.of(setup.claim().id(), otherClaim.id())))
                .containsOnly(Map.entry(setup.claim().id(), 2L));
        assertThat(donations.countBySymbolClaims(List.of())).isEmpty();
    }

    @Test
    @DisplayName("Given a claim with a donation paired through it, when the claim is deleted, then the database refuses it")
    void should_refuse_when_claim_deleted_given_donation_paired_through_it() {
        ConfirmedSymbolSetup setup = confirmedSymbolSetup();
        donations.save(Donation.pairedByConfirmedSymbol(DonationId.newId(NOW), setup.donor(), setup.payment(), setup.link().id(),
                setup.claim().id(), NOW));
        entityManager.flush();

        assertThatThrownBy(() -> jdbc.sql("delete from donor_symbol_claim where id = ?").param(setup.claim().id().value()).update())
                .hasMessageContaining("fk_donation_symbol_claim");
    }

    private void insertDonation(ConfirmedSymbolSetup setup, String pairedBy, UUID link, UUID claim) {
        jdbc.sql("insert into donation (id, donor_id, bank_payment_id, received_on, amount_minor, currency, source, status, paired_by,"
                        + " sender_account_id, symbol_claim_id, purpose, recorded_at)"
                        + " values (?, ?, ?, current_date, 100, 'CZK', 'BANK_TRANSFER', 'RECEIVED', ?, ?, ?, 'GENERAL', now())")
                .params(UuidV7.generate(NOW), setup.donor().value(), setup.payment().id().value(), pairedBy, link, claim)
                .update();
    }

    private ConfirmedSymbolSetup confirmedSymbolSetup() {
        DonorRecord jana = DonorRecord.registerPerson(new DonorReference(UuidV7.generate(NOW)), "Jana Nováková",
                new PostalAddress("Dlouhá 12", "Ústí nad Labem", "400 01"), new VariableSymbol("4821937560"), LocaleCode.CS, NOW);
        donorRecords.save(jana);
        BankPayment proof = payment(1001, LocalDate.of(2026, 10, 14), Money.czk(100), ACCOUNT, "4821937560");
        BankPayment old = payment(1002, LocalDate.of(2026, 10, 15), Money.czk(50000), ACCOUNT, "6123456789");
        payments.saveAll(List.of(proof, old));
        SenderAccountLink link = jana.learnSenderAccountFrom(proof, Optional.empty(), ExcludedSenderAccounts.none(), NOW).orElseThrow();
        donorRecords.saveSenderAccountLink(jana.id(), link);
        SymbolClaim claim = SymbolClaim.answer(SymbolClaimId.newId(NOW), jana.id(), ACCOUNT.orElseThrow(), new VariableSymbol("6123456789"),
                SymbolClaimAnswer.CONFIRMED, NOW);
        claims.saveIfAbsent(claim);
        return new ConfirmedSymbolSetup(jana.id(), old, link, claim);
    }

    private record ConfirmedSymbolSetup(DonorReference donor, BankPayment payment, SenderAccountLink link, SymbolClaim claim) {
    }

    private Donation bySymbol(DonorReference donor, BankPayment payment) {
        return Donation.fromBankPayment(DonationId.newId(NOW), donor, payment, PairingMethod.VARIABLE_SYMBOL, NOW);
    }

    @Test
    @DisplayName("Given a donation paired by hand, when it is saved and looked up by its payment, then it comes back and a deletion frees the payment")
    void should_find_by_payment_and_free_it_when_deleted_given_manual_donation() {
        DonorReference jana = storedDonor("4821937560");
        BankPayment payment = storedPayment(1001, LocalDate.of(2026, 10, 15));
        Donation donation = Donation.fromBankPayment(DonationId.newId(NOW), jana, payment, PairingMethod.MANUAL, NOW);
        donations.save(donation);
        flushAndClear();

        assertThat(donations.findByBankPayment(payment.id())).hasValueSatisfying(stored -> {
            assertThat(stored.id()).isEqualTo(donation.id());
            assertThat(stored.pairedBy()).contains(PairingMethod.MANUAL);
        });
        assertThat(donations.findByBankPayment(BankPaymentId.newId(NOW))).isEmpty();

        donations.delete(donation.id());
        flushAndClear();

        assertThat(donations.findByBankPayment(payment.id())).isEmpty();
        assertThat(donations.existsForBankPayment(payment.id())).isFalse();
        assertThat(payments.findById(payment.id())).isPresent();
    }

    @Test
    @DisplayName("Given donations received in several years, when the years are listed, then each year comes once, newest first")
    void should_list_distinct_years_newest_first_when_listed_given_donations_in_several_years() {
        DonorReference jana = storedDonor("4821937560");
        donations.save(Donation.fromBankPayment(DonationId.newId(NOW), jana, storedPayment(1001, LocalDate.of(2025, 3, 1)),
                PairingMethod.MANUAL, NOW));
        donations.save(Donation.fromBankPayment(DonationId.newId(NOW), jana, storedPayment(1002, LocalDate.of(2026, 10, 15)),
                PairingMethod.VARIABLE_SYMBOL, NOW));
        donations.save(Donation.fromBankPayment(DonationId.newId(NOW), jana, storedPayment(1003, LocalDate.of(2026, 1, 2)),
                PairingMethod.VARIABLE_SYMBOL, NOW));
        flushAndClear();

        assertThat(donations.findReceivedYearsNewestFirst()).containsExactly(Year.of(2026), Year.of(2025));
    }

    @Test
    @DisplayName("Given donations paired through a link by account and by confirmed symbol and one by symbol alone, when the link's donations are asked for, then only the two through the link come, oldest first")
    void should_find_link_donations_oldest_first_when_asked_given_mixed_pairings() {
        ConfirmedSymbolSetup setup = confirmedSymbolSetup();
        BankPayment byAccountPayment = payment(1003, LocalDate.of(2026, 10, 13), Money.czk(20000), ACCOUNT, null);
        BankPayment bySymbolPayment = payment(1004, LocalDate.of(2026, 10, 21), Money.czk(50000), ACCOUNT, "4821937560");
        payments.saveAll(List.of(byAccountPayment, bySymbolPayment));
        Donation byClaim = Donation.pairedByConfirmedSymbol(DonationId.newId(NOW), setup.donor(), setup.payment(), setup.link().id(),
                setup.claim().id(), NOW);
        Donation byAccount = Donation.pairedBySenderAccount(DonationId.newId(NOW.plusMillis(1)), setup.donor(), byAccountPayment, setup.link().id(), NOW);
        donations.save(byClaim);
        donations.save(byAccount);
        donations.save(bySymbol(setup.donor(), bySymbolPayment));
        flushAndClear();

        assertThat(donations.findBySenderAccountLink(setup.link().id())).extracting(Donation::id).containsExactly(byAccount.id(), byClaim.id());
        assertThat(donations.findBySenderAccountLink(SenderAccountLinkId.newId(NOW))).isEmpty();
    }

    private DonorReference storedDonor(String symbol) {
        DonorRecord record = DonorRecord.registerPerson(new DonorReference(UuidV7.generate(NOW)), "Jana Nováková",
                new PostalAddress("Dlouhá 12", "Ústí nad Labem", "400 01"), new VariableSymbol(symbol), LocaleCode.CS, NOW);
        donorRecords.save(record);
        return record.id();
    }

    private BankPayment storedPayment(long transactionId, LocalDate bookedOn) {
        BankPayment payment = payment(transactionId, bookedOn, Money.czk(50000), ACCOUNT, null);
        payments.saveAll(List.of(payment));
        return payment;
    }

    private void flushAndClear() {
        entityManager.flush();
        entityManager.clear();
    }
}

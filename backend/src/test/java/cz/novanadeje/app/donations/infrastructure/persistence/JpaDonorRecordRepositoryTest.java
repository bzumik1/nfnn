package cz.novanadeje.app.donations.infrastructure.persistence;

import cz.novanadeje.app.donations.domain.bank.BankPayment;
import cz.novanadeje.app.donations.domain.bank.BankPaymentRepository;
import cz.novanadeje.app.donations.domain.bank.SenderAccount;
import cz.novanadeje.app.donations.domain.donor.DonorRecord;
import cz.novanadeje.app.donations.domain.donor.DonorRecordRepository;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.donations.domain.donor.LearnedSenderAccount;
import cz.novanadeje.app.shared.domain.LocaleCode;
import cz.novanadeje.app.shared.domain.PostalAddress;
import cz.novanadeje.app.shared.domain.UuidV7;
import cz.novanadeje.app.shared.domain.VariableSymbol;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static cz.novanadeje.app.donations.BankPayments.payment;
import static cz.novanadeje.app.donations.infrastructure.persistence.BankPersistenceTestConfiguration.NOW;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalStateException;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(BankPersistenceTestConfiguration.class)
class JpaDonorRecordRepositoryTest {

    private static final Instant LEARNED_AT = NOW.plusSeconds(600);
    private static final Instant LATER = NOW.plusSeconds(3600);
    private static final SenderAccount ACCOUNT = new SenderAccount("2900233333", "2010");
    private static final PostalAddress ADDRESS = new PostalAddress("Dlouhá 12", "Ústí nad Labem", "400 01");

    @Autowired
    private DonorRecordRepository donorRecords;
    @Autowired
    private BankPaymentRepository payments;
    @Autowired
    private EntityManager entityManager;
    @Autowired
    private JdbcClient jdbc;

    @Test
    @DisplayName("Given a saved record, when it is read back by id and by symbol, then the profile survives")
    void should_keep_profile_when_saved_and_read_given_new_record() {
        DonorRecord jana = person("Jana Nováková", "4821937560");
        donorRecords.save(jana);
        flushAndClear();

        DonorRecord byId = donorRecords.findById(jana.id()).orElseThrow();
        assertThat(byId.name()).isEqualTo("Jana Nováková");
        assertThat(byId.address()).isEqualTo(ADDRESS);
        assertThat(byId.variableSymbol()).isEqualTo(new VariableSymbol("4821937560"));
        assertThat(byId.registeredAt()).isEqualTo(NOW);
        assertThat(byId.learnedSenderAccounts()).isEmpty();
        assertThat(donorRecords.findByVariableSymbol(new VariableSymbol("4821937560"))).map(DonorRecord::id).contains(jana.id());
        assertThat(donorRecords.findById(new DonorReference(UuidV7.generate(NOW)))).isEmpty();
    }

    @Test
    @DisplayName("Given a learned account, when it is added twice, then one row is stored and the record is read back with it and its provenance")
    void should_store_one_row_when_added_twice_given_learned_account() {
        DonorRecord jana = person("Jana Nováková", "4821937560");
        donorRecords.save(jana);
        BankPayment payment = storedPayment(1001, jana.variableSymbol().value());
        LearnedSenderAccount learned = jana.learnSenderAccountFrom(payment, LEARNED_AT).orElseThrow();

        donorRecords.addSenderAccount(jana.id(), learned);
        donorRecords.addSenderAccount(jana.id(), learned);
        flushAndClear();

        assertThat(accountRows()).isEqualTo(1L);
        assertThat(donorRecords.findById(jana.id()).orElseThrow().learnedSenderAccounts())
                .containsExactly(new LearnedSenderAccount(ACCOUNT, payment.id(), LEARNED_AT));
        assertThat(donorRecords.findByVariableSymbol(jana.variableSymbol()).orElseThrow().paysFrom(ACCOUNT)).isTrue();
    }

    @Test
    @DisplayName("Given a record with a stored account, when the profile is changed and saved, then the account row stays untouched")
    void should_leave_account_rows_untouched_when_saved_after_profile_change_given_stored_account() {
        DonorRecord jana = person("Jana Nováková", "4821937560");
        donorRecords.save(jana);
        BankPayment payment = storedPayment(1001, jana.variableSymbol().value());
        donorRecords.addSenderAccount(jana.id(), jana.learnSenderAccountFrom(payment, LEARNED_AT).orElseThrow());
        flushAndClear();

        DonorRecord stored = donorRecords.findById(jana.id()).orElseThrow();
        stored.changeProfile("Jana Malá", new PostalAddress("Krátká 3", "Praha", "110 00"), LocaleCode.EN, LATER);
        donorRecords.save(stored);
        flushAndClear();

        Map<String, Object> row = jdbc.sql("select account_number, bank_code, learned_from_payment_id, learned_at from donor_sender_account")
                .query().singleRow();
        assertThat(row).containsEntry("account_number", "2900233333").containsEntry("bank_code", "2010")
                .containsEntry("learned_from_payment_id", payment.id().value());
        assertThat(accountRows()).isEqualTo(1L);
        DonorRecord reread = donorRecords.findById(jana.id()).orElseThrow();
        assertThat(reread.name()).isEqualTo("Jana Malá");
        assertThat(reread.learnedSenderAccounts()).containsExactly(new LearnedSenderAccount(ACCOUNT, payment.id(), LEARNED_AT));
    }

    @Test
    @DisplayName("Given two donors who learned one account and a third who did not, when owners of the account are asked for, then the two are found")
    void should_find_owners_when_asked_by_account_given_shared_account() {
        DonorRecord jana = person("Jana Nováková", "4821937560");
        DonorRecord petr = person("Petr Svoboda", "7310945528");
        DonorRecord eva = person("Eva Malá", "5550001112");
        donorRecords.save(jana);
        donorRecords.save(petr);
        donorRecords.save(eva);
        donorRecords.addSenderAccount(jana.id(), jana.learnSenderAccountFrom(storedPayment(1001, "4821937560"), LEARNED_AT).orElseThrow());
        donorRecords.addSenderAccount(petr.id(), petr.learnSenderAccountFrom(storedPayment(1002, "7310945528"), LEARNED_AT).orElseThrow());
        flushAndClear();

        List<DonorRecord> owners = donorRecords.findBySenderAccount(ACCOUNT);

        assertThat(owners).extracting(DonorRecord::id).containsExactlyInAnyOrder(jana.id(), petr.id());
        assertThat(owners).allSatisfy(owner -> assertThat(owner.paysFrom(ACCOUNT)).isTrue());
        assertThat(donorRecords.findBySenderAccount(new SenderAccount("19-2000145399", "0800"))).isEmpty();
    }

    @Test
    @DisplayName("Given a record holding an account that was never added, when it is saved, then the save is refused")
    void should_refuse_when_saved_given_unstored_account() {
        DonorRecord jana = person("Jana Nováková", "4821937560");
        donorRecords.save(jana);
        flushAndClear();
        DonorRecord stored = donorRecords.findById(jana.id()).orElseThrow();
        stored.learnSenderAccountFrom(storedPayment(1001, "4821937560"), LEARNED_AT);

        assertThatIllegalStateException().isThrownBy(() -> donorRecords.save(stored));
        assertThat(accountRows()).isZero();
    }

    private DonorRecord person(String name, String symbol) {
        return DonorRecord.registerPerson(new DonorReference(UuidV7.generate(NOW)), name, ADDRESS, new VariableSymbol(symbol), LocaleCode.CS, NOW);
    }

    private BankPayment storedPayment(long transactionId, String variableSymbol) {
        BankPayment payment = payment(transactionId, Optional.of(ACCOUNT), variableSymbol);
        payments.saveAll(List.of(payment));
        entityManager.flush();
        return payment;
    }

    private long accountRows() {
        return jdbc.sql("select count(*) from donor_sender_account").query(Long.class).single();
    }

    private void flushAndClear() {
        entityManager.flush();
        entityManager.clear();
    }
}

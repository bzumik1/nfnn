package cz.novanadeje.app.donations.infrastructure.persistence;

import cz.novanadeje.app.donations.domain.bank.BankPayment;
import cz.novanadeje.app.donations.domain.bank.BankPaymentRepository;
import cz.novanadeje.app.donations.domain.bank.SenderAccount;
import cz.novanadeje.app.donations.domain.donor.DonorRecord;
import cz.novanadeje.app.donations.domain.donor.DonorRecordRepository;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.donations.domain.donor.ExcludedSenderAccounts;
import cz.novanadeje.app.donations.domain.donor.SenderAccountLink;
import cz.novanadeje.app.donations.domain.donor.SenderAccountLinkStatus;
import cz.novanadeje.app.shared.domain.ErasedPersonalData;
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
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static cz.novanadeje.app.donations.BankPayments.payment;
import static cz.novanadeje.app.donations.infrastructure.persistence.BankPersistenceTestConfiguration.NOW;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalStateException;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

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
        assertThat(byId.senderAccountLinks()).isEmpty();
        assertThat(donorRecords.findByVariableSymbol(new VariableSymbol("4821937560"))).map(DonorRecord::id).contains(jana.id());
        assertThat(donorRecords.findById(new DonorReference(UuidV7.generate(NOW)))).isEmpty();
    }

    @Test
    @DisplayName("Given a learned account, when it is saved twice or a second live link to it is saved, then one row is stored and the record is read back with it and its proof")
    void should_store_one_row_when_saved_twice_given_learned_account() {
        DonorRecord jana = person("Jana Nováková", "4821937560");
        donorRecords.save(jana);
        BankPayment payment = storedPayment(1001, jana.variableSymbol().value());
        SenderAccountLink learned = learn(jana, payment);
        DonorRecord concurrentCopy = person("Jana Nováková", "4821937560", jana.id());
        SenderAccountLink concurrent = learn(concurrentCopy, storedPayment(1002, jana.variableSymbol().value()));

        assertThat(donorRecords.saveSenderAccountLink(jana.id(), learned)).isTrue();
        assertThat(donorRecords.saveSenderAccountLink(jana.id(), learned)).isTrue();
        assertThat(donorRecords.saveSenderAccountLink(jana.id(), concurrent)).isFalse();
        flushAndClear();

        assertThat(accountRows()).isEqualTo(1L);
        SenderAccountLink reread = donorRecords.findById(jana.id()).orElseThrow().senderAccountLinks().getFirst();
        assertThat(reread.id()).isEqualTo(learned.id());
        assertThat(reread.account()).isEqualTo(ACCOUNT);
        assertThat(reread.status()).isEqualTo(SenderAccountLinkStatus.ACTIVE);
        assertThat(reread.provedBy()).contains(payment.id());
        assertThat(reread.provedAt()).contains(LEARNED_AT);
        assertThat(reread.createdAt()).isEqualTo(LEARNED_AT);
        assertThat(donorRecords.findByVariableSymbol(jana.variableSymbol()).orElseThrow().usesSenderAccount(ACCOUNT)).isTrue();
    }

    @Test
    @DisplayName("Given a stored link, when it is disconnected and reconnected, then the old row keeps its end and a new row awaits a payment")
    void should_keep_history_when_disconnected_and_reconnected_given_stored_link() {
        DonorRecord jana = person("Jana Nováková", "4821937560");
        donorRecords.save(jana);
        donorRecords.saveSenderAccountLink(jana.id(), learn(jana, storedPayment(1001, jana.variableSymbol().value())));
        flushAndClear();
        LocalDate today = LocalDate.of(2026, 10, 18);

        DonorRecord stored = donorRecords.findById(jana.id()).orElseThrow();
        SenderAccountLink disconnected = stored.disconnectSenderAccount(stored.senderAccountLinks().getFirst().id(), today, LATER);
        donorRecords.saveSenderAccountLink(jana.id(), disconnected);
        SenderAccountLink awaiting = stored.reconnectSenderAccount(disconnected.id(), today.plusDays(1), LATER.plusSeconds(60));
        assertThat(donorRecords.saveSenderAccountLink(jana.id(), awaiting)).isTrue();
        flushAndClear();

        List<SenderAccountLink> links = donorRecords.findById(jana.id()).orElseThrow().senderAccountLinks();
        assertThat(links).extracting(SenderAccountLink::status)
                .containsExactly(SenderAccountLinkStatus.DISCONNECTED, SenderAccountLinkStatus.AWAITING_PAYMENT);
        assertThat(links.getFirst().validTo()).contains(today);
        assertThat(links.getFirst().disconnectedAt()).contains(LATER);
        assertThat(links.get(1).id()).isEqualTo(awaiting.id());
        assertThat(links.get(1).validFrom()).contains(today.plusDays(1));
        assertThat(links.get(1).provedBy()).isEmpty();
        assertThat(accountRows()).isEqualTo(2L);
    }

    @Test
    @DisplayName("Given a record with a stored account, when the profile is changed and saved, then the account row stays untouched")
    void should_leave_account_rows_untouched_when_saved_after_profile_change_given_stored_account() {
        DonorRecord jana = person("Jana Nováková", "4821937560");
        donorRecords.save(jana);
        BankPayment payment = storedPayment(1001, jana.variableSymbol().value());
        donorRecords.saveSenderAccountLink(jana.id(), learn(jana, payment));
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
        assertThat(reread.senderAccountLinks()).singleElement().satisfies(link -> assertThat(link.provedBy()).contains(payment.id()));
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
        donorRecords.saveSenderAccountLink(jana.id(), learn(jana, storedPayment(1001, "4821937560")));
        donorRecords.saveSenderAccountLink(petr.id(), learn(petr, storedPayment(1002, "7310945528")));
        flushAndClear();

        List<DonorRecord> owners = donorRecords.findBySenderAccount(ACCOUNT);

        assertThat(owners).extracting(DonorRecord::id).containsExactlyInAnyOrder(jana.id(), petr.id());
        assertThat(owners).allSatisfy(owner -> assertThat(owner.usesSenderAccount(ACCOUNT)).isTrue());
        assertThat(donorRecords.findBySenderAccount(new SenderAccount("19-2000145399", "0800"))).isEmpty();
    }

    @Test
    @DisplayName("Given a record holding an account that was never added, when it is saved, then the save is refused")
    void should_refuse_when_saved_given_unstored_account() {
        DonorRecord jana = person("Jana Nováková", "4821937560");
        donorRecords.save(jana);
        flushAndClear();
        DonorRecord stored = donorRecords.findById(jana.id()).orElseThrow();
        learn(stored, storedPayment(1001, "4821937560"));

        assertThatIllegalStateException().isThrownBy(() -> donorRecords.save(stored));
        assertThat(accountRows()).isZero();
    }

    @Test
    @DisplayName("Given donors registered at three instants, when donors registered before an instant are counted, then only the earlier ones count")
    void should_count_only_earlier_registrations_when_counted_given_three_registration_times() {
        donorRecords.save(registeredAt("4821937560", NOW));
        donorRecords.save(registeredAt("7310945528", LATER));
        donorRecords.save(registeredAt("1234567890", LATER.plusSeconds(1)));
        flushAndClear();

        assertThat(donorRecords.countRegisteredBefore(NOW)).isZero();
        assertThat(donorRecords.countRegisteredBefore(LATER)).isEqualTo(1);
        assertThat(donorRecords.countRegisteredBefore(LATER.plusSeconds(2))).isEqualTo(3);
    }

    @Test
    @DisplayName("Given donors registered at three instants, when donors registered since an instant are counted, then that instant and the later ones count")
    void should_count_registrations_from_the_instant_on_when_counted_given_three_registration_times() {
        donorRecords.save(registeredAt("4821937560", NOW));
        donorRecords.save(registeredAt("7310945528", LATER));
        donorRecords.save(registeredAt("1234567890", LATER.plusSeconds(1)));
        flushAndClear();

        assertThat(donorRecords.countRegisteredSince(NOW)).isEqualTo(3);
        assertThat(donorRecords.countRegisteredSince(LATER)).isEqualTo(2);
        assertThat(donorRecords.countRegisteredSince(LATER.plusSeconds(2))).isZero();
    }

    @Test
    @DisplayName("Given stored records, when several are asked for by id, then exactly those come back with their accounts")
    void should_find_records_when_asked_by_ids_given_stored_records() {
        DonorRecord jana = person("Jana Nováková", "4821937560");
        DonorRecord petr = person("Petr Svoboda", "7310945528");
        DonorRecord eva = person("Eva Dvořáková", "5555555555");
        donorRecords.save(jana);
        donorRecords.save(petr);
        donorRecords.save(eva);
        flushAndClear();

        assertThat(donorRecords.findByIds(List.of(jana.id(), eva.id(), new DonorReference(UuidV7.generate(LATER)))))
                .extracting(DonorRecord::name).containsExactlyInAnyOrder("Jana Nováková", "Eva Dvořáková");
        assertThat(donorRecords.findByIds(List.of())).isEmpty();
    }

    @Test
    @DisplayName("Given stored records, when searched by a part of the name or the start of the symbol, then the matches come by name, at most the limit, and like-wildcards are literal")
    void should_find_by_name_part_or_symbol_start_when_searched_given_stored_records() {
        donorRecords.save(person("Jana Nováková", "4821937560"));
        donorRecords.save(person("Petr Novák", "7310945528"));
        donorRecords.save(person("Eva Dvořáková", "4899999999"));
        donorRecords.save(person("Karel 100% Veselý", "1000000000"));
        flushAndClear();

        assertThat(donorRecords.searchByNameOrSymbol("novák", 20)).extracting(DonorRecord::name).containsExactly("Jana Nováková", "Petr Novák");
        assertThat(donorRecords.searchByNameOrSymbol("48", 20)).extracting(DonorRecord::name).containsExactly("Eva Dvořáková", "Jana Nováková");
        assertThat(donorRecords.searchByNameOrSymbol("48", 1)).extracting(DonorRecord::name).containsExactly("Eva Dvořáková");
        assertThat(donorRecords.searchByNameOrSymbol("100%", 20)).extracting(DonorRecord::name).containsExactly("Karel 100% Veselý");
        assertThat(donorRecords.searchByNameOrSymbol("%", 20)).extracting(DonorRecord::name).containsExactly("Karel 100% Veselý");
        assertThat(donorRecords.searchByNameOrSymbol("xyz", 20)).isEmpty();
    }

    @Test
    @DisplayName("Given records with Czech letters, when searched with or without the accents and in any case, then the same records match")
    void should_ignore_accents_and_case_when_searched_given_czech_names() {
        donorRecords.save(person("Jana Nováková", "4821937560"));
        donorRecords.save(person("Eva Dvořáková", "4899999999"));
        donorRecords.save(person("ŠTĚPÁN ŘÍHA", "1000000000"));
        flushAndClear();

        assertThat(donorRecords.searchByNameOrSymbol("novakova", 20)).extracting(DonorRecord::name).containsExactly("Jana Nováková");
        assertThat(donorRecords.searchByNameOrSymbol("DVORAK", 20)).extracting(DonorRecord::name).containsExactly("Eva Dvořáková");
        assertThat(donorRecords.searchByNameOrSymbol("štěpán říha", 20)).extracting(DonorRecord::name).containsExactly("ŠTĚPÁN ŘÍHA");
        assertThat(donorRecords.searchByNameOrSymbol("stepan riha", 20)).extracting(DonorRecord::name).containsExactly("ŠTĚPÁN ŘÍHA");
        assertThat(donorRecords.searchByNameOrSymbol("ková", 20)).extracting(DonorRecord::name).containsExactly("Eva Dvořáková", "Jana Nováková");
    }

    @Test
    @DisplayName("Given a stored link, when it is deleted for its donor, then its row is gone, the record no longer lists it, and another donor's link cannot be deleted through it")
    void should_delete_row_when_link_deleted_given_stored_link() {
        DonorRecord jana = person("Jana Nováková", "4821937560");
        DonorRecord petr = person("Petr Novák", "7310945528");
        donorRecords.save(jana);
        donorRecords.save(petr);
        SenderAccountLink janas = learn(jana, storedPayment(1001, jana.variableSymbol().value()));
        donorRecords.saveSenderAccountLink(jana.id(), janas);
        flushAndClear();

        assertThatThrownBy(() -> donorRecords.deleteSenderAccountLink(petr.id(), janas.id())).isInstanceOf(IllegalArgumentException.class);
        donorRecords.deleteSenderAccountLink(jana.id(), janas.id());
        flushAndClear();

        assertThat(accountRows()).isZero();
        assertThat(donorRecords.findById(jana.id()).orElseThrow().senderAccountLinks()).isEmpty();
        assertThat(donorRecords.findBySenderAccount(ACCOUNT)).isEmpty();
    }

    @Test
    @DisplayName("Given a stored record with a learned account, when its links are deleted and the erased record is saved, then the rows are gone, the erasure survives a reload, and the search by name or symbol no longer finds it")
    void should_keep_erasure_and_hide_from_search_when_erased_given_stored_record_with_account() {
        DonorRecord jana = person("Jana Nováková", "4821937560");
        donorRecords.save(jana);
        donorRecords.saveSenderAccountLink(jana.id(), learn(jana, storedPayment(1001, jana.variableSymbol().value())));
        donorRecords.save(person("Petr Novák", "7310945528"));
        flushAndClear();

        DonorRecord stored = donorRecords.findById(jana.id()).orElseThrow();
        stored.erase(LATER);
        donorRecords.deleteSenderAccountLinksOf(jana.id());
        donorRecords.save(stored);
        flushAndClear();

        DonorRecord reloaded = donorRecords.findById(jana.id()).orElseThrow();
        assertThat(reloaded.isErased()).isTrue();
        assertThat(reloaded.erasedAt()).contains(LATER);
        assertThat(reloaded.name()).isEqualTo(ErasedPersonalData.NAME);
        assertThat(reloaded.address()).isEqualTo(ErasedPersonalData.ADDRESS);
        assertThat(reloaded.variableSymbol()).isEqualTo(new VariableSymbol("4821937560"));
        assertThat(reloaded.senderAccountLinks()).isEmpty();
        assertThat(accountRows()).isZero();
        assertThat(donorRecords.findBySenderAccount(ACCOUNT)).isEmpty();
        assertThat(donorRecords.findByVariableSymbol(new VariableSymbol("4821937560"))).map(DonorRecord::id).contains(jana.id());
        assertThat(donorRecords.searchByNameOrSymbol("48", 20)).isEmpty();
        assertThat(donorRecords.searchByNameOrSymbol("vymaz", 20)).isEmpty();
        assertThat(donorRecords.searchByNameOrSymbol("novák", 20)).extracting(DonorRecord::name).containsExactly("Petr Novák");
    }

    private static DonorRecord registeredAt(String symbol, Instant at) {
        return DonorRecord.registerPerson(new DonorReference(UuidV7.generate(at)), "Jana Nováková", ADDRESS, new VariableSymbol(symbol),
                LocaleCode.CS, at);
    }

    private DonorRecord person(String name, String symbol) {
        return person(name, symbol, new DonorReference(UuidV7.generate(NOW)));
    }

    private DonorRecord person(String name, String symbol, DonorReference id) {
        return DonorRecord.registerPerson(id, name, ADDRESS, new VariableSymbol(symbol), LocaleCode.CS, NOW);
    }

    private static SenderAccountLink learn(DonorRecord record, BankPayment payment) {
        return record.learnSenderAccountFrom(payment, Optional.empty(), ExcludedSenderAccounts.none(), LEARNED_AT).orElseThrow();
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

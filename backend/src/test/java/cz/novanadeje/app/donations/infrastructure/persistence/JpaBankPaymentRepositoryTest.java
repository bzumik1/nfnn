package cz.novanadeje.app.donations.infrastructure.persistence;

import cz.novanadeje.app.donations.domain.bank.BankPayment;
import cz.novanadeje.app.donations.domain.bank.BankPaymentId;
import cz.novanadeje.app.donations.domain.bank.BankPaymentRepository;
import cz.novanadeje.app.donations.domain.bank.BankTransactionId;
import cz.novanadeje.app.donations.domain.bank.IncomingMovement;
import cz.novanadeje.app.donations.domain.bank.SenderAccount;
import cz.novanadeje.app.shared.domain.Money;
import cz.novanadeje.app.shared.domain.VariableSymbol;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.simple.JdbcClient;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static cz.novanadeje.app.donations.infrastructure.persistence.BankPersistenceTestConfiguration.NOW;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(BankPersistenceTestConfiguration.class)
class JpaBankPaymentRepositoryTest {

    private static final Optional<SenderAccount> JANA_ACCOUNT = SenderAccount.parse("2900233333", "2010");

    @Autowired
    private BankPaymentRepository payments;
    @Autowired
    private EntityManager entityManager;
    @Autowired
    private JdbcClient jdbc;

    @Test
    @DisplayName("Given a stored payment, when it is read back, then every field survives the round trip")
    void should_keep_every_field_when_saved_and_read_given_full_payment() {
        BankPayment payment = BankPayment.incoming(BankPaymentId.newId(NOW), IncomingMovement.of(new BankTransactionId(1001),
                LocalDate.of(2026, 10, 15), Money.czk(50050), SenderAccount.parse("000019-2000145399", "0800"),
                Optional.of("19-2000145399"), Optional.of("0800"), Optional.of("Nováková Jana"), Optional.of("0558"),
                Optional.of("0308"), Optional.of("77"), Optional.of("Dar pro nadaci"), "Bezhotovostní příjem"), NOW);

        payments.saveAll(List.of(payment));
        flushAndClear();

        assertThat(payments.findById(payment.id())).contains(payment);
    }

    @Test
    @DisplayName("Given a stored payment with a padded symbol, when the columns are read, then the raw and the matching symbol are both stored")
    void should_store_raw_and_matching_symbol_when_saved_given_padded_symbol() {
        BankPayment payment = payment(1001, "2026-10-15", JANA_ACCOUNT, "0004821937560");

        payments.saveAll(List.of(payment));
        flushAndClear();

        Map<String, Object> row = jdbc.sql("select variable_symbol, matching_variable_symbol from bank_payment where id = ?")
                .param(payment.id().value()).query().singleRow();
        assertThat(row).containsEntry("variable_symbol", "0004821937560").containsEntry("matching_variable_symbol", "4821937560");
    }

    @Test
    @DisplayName("Given a payment without a sender or texts, when it is read back, then the optional fields stay empty")
    void should_keep_empty_optionals_when_saved_given_minimal_payment() {
        BankPayment payment = payment(1001, "2026-10-15", Optional.empty(), null);

        payments.saveAll(List.of(payment));
        flushAndClear();

        assertThat(payments.findById(payment.id())).contains(payment);
    }

    @Test
    @DisplayName("Given a stored transaction id, when another payment with it is saved, then the database refuses it")
    void should_refuse_when_saved_given_duplicate_transaction_id() {
        payments.saveAll(List.of(payment(1001, "2026-10-15", JANA_ACCOUNT, null)));
        flushAndClear();

        assertThatThrownBy(() -> {
            payments.saveAll(List.of(payment(1001, "2026-10-16", JANA_ACCOUNT, null)));
            entityManager.flush();
        }).isInstanceOfAny(DataIntegrityViolationException.class, org.hibernate.exception.ConstraintViolationException.class);
    }

    @Test
    @DisplayName("Given stored payments, when known ids are asked for, then only the stored ones among the asked are returned")
    void should_return_only_stored_ids_when_known_ids_asked() {
        payments.saveAll(List.of(payment(1001, "2026-10-15", JANA_ACCOUNT, null), payment(1002, "2026-10-16", JANA_ACCOUNT, null)));
        flushAndClear();

        assertThat(payments.findKnownTransactionIds(List.of(new BankTransactionId(1002), new BankTransactionId(1003))))
                .containsExactly(new BankTransactionId(1002));
        assertThat(payments.findKnownTransactionIds(List.of())).isEmpty();
    }

    @Test
    @DisplayName("Given unpaired payments, when they are listed, then they come ordered by booking date and then by transaction id")
    void should_order_by_booking_then_transaction_when_unpaired_listed() {
        payments.saveAll(List.of(
                payment(1003, "2026-10-15", JANA_ACCOUNT, null),
                payment(1004, "2026-10-14", JANA_ACCOUNT, null),
                payment(1001, "2026-10-15", JANA_ACCOUNT, null),
                payment(1002, "2026-10-16", JANA_ACCOUNT, null)));
        flushAndClear();

        assertThat(payments.findUnpairedOrderedByBooking()).extracting(payment -> payment.transactionId().value())
                .containsExactly(1004L, 1001L, 1003L, 1002L);
    }

    @Test
    @DisplayName("Given payments with several symbols, when unpaired ones are asked for by a symbol, then only those matching it are returned")
    void should_find_by_matching_symbol_when_unpaired_asked_by_symbol() {
        payments.saveAll(List.of(
                payment(1001, "2026-10-15", JANA_ACCOUNT, "0004821937560"),
                payment(1002, "2026-10-14", JANA_ACCOUNT, "4821937560"),
                payment(1003, "2026-10-16", JANA_ACCOUNT, "1111111111"),
                payment(1004, "2026-10-16", JANA_ACCOUNT, null)));
        flushAndClear();

        assertThat(payments.findUnpairedByMatchingVariableSymbol(new VariableSymbol("4821937560")))
                .extracting(payment -> payment.transactionId().value())
                .containsExactly(1002L, 1001L);
    }

    @Test
    @DisplayName("Given payments from several accounts, when unpaired ones without a symbol are asked for by an account, then only those from it without a symbol are returned")
    void should_find_symbol_less_payments_of_account_when_unpaired_asked_by_account() {
        payments.saveAll(List.of(
                payment(1001, "2026-10-15", JANA_ACCOUNT, null),
                payment(1002, "2026-10-14", JANA_ACCOUNT, "4821937560"),
                payment(1003, "2026-10-16", SenderAccount.parse("19-2000145399", "0800"), null),
                payment(1004, "2026-10-13", JANA_ACCOUNT, "ABC"),
                payment(1005, "2026-10-16", Optional.empty(), null)));
        flushAndClear();

        assertThat(payments.findUnpairedWithoutSymbolBySenderAccount(JANA_ACCOUNT.orElseThrow()))
                .extracting(payment -> payment.transactionId().value())
                .containsExactly(1004L, 1001L);
    }

    @Test
    void should_be_empty_when_found_by_id_given_unknown_id() {
        assertThat(payments.findById(BankPaymentId.newId(NOW))).isEmpty();
    }

    private void flushAndClear() {
        entityManager.flush();
        entityManager.clear();
    }

    private static BankPayment payment(long transactionId, String bookedOn, Optional<SenderAccount> sender, String variableSymbol) {
        Instant importedAt = NOW;
        return BankPayment.incoming(BankPaymentId.newId(importedAt), IncomingMovement.of(new BankTransactionId(transactionId),
                LocalDate.parse(bookedOn), Money.czk(20000), sender, sender.map(SenderAccount::accountNumber),
                sender.map(SenderAccount::bankCode), Optional.empty(), Optional.ofNullable(variableSymbol), Optional.empty(),
                Optional.empty(), Optional.empty(), "Bezhotovostní příjem"), importedAt);
    }
}

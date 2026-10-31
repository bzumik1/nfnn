package cz.novanadeje.app.donations.infrastructure.persistence;

import cz.novanadeje.app.donations.domain.receipt.PersonReference;
import cz.novanadeje.app.donations.domain.receipt.ReceiptSignatory;
import cz.novanadeje.app.donations.domain.receipt.ReceiptSignatoryRepository;
import cz.novanadeje.app.shared.application.people.ReceiptSignatoryLookup;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

import java.util.UUID;

import static cz.novanadeje.app.donations.infrastructure.persistence.BankPersistenceTestConfiguration.NOW;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(BankPersistenceTestConfiguration.class)
class JpaReceiptSignatoryRepositoryTest {

    private static final UUID FIRST = UUID.fromString("019a3a00-0000-7000-8000-00000000d001");
    private static final UUID SECOND = UUID.fromString("019a3a00-0000-7000-8000-00000000d002");

    @Autowired
    private ReceiptSignatoryRepository signatories;
    @Autowired
    private ReceiptSignatoryLookup lookup;
    @Autowired
    private JdbcClient jdbc;
    @Autowired
    private EntityManager entityManager;

    @Test
    @DisplayName("Given no signatory chosen, when the signatory is read, then there is none and nobody signs the receipts")
    void should_answer_nothing_when_read_given_no_signatory_chosen() {
        assertThat(signatories.current()).isEmpty();
        assertThat(lookup.signsReceipts(FIRST)).isFalse();
    }

    @Test
    @DisplayName("Given a signatory chosen, when it is read, then the person, the receipt role and the time come back and only that person signs")
    void should_round_trip_when_chosen_given_signatory() {
        signatories.choose(new ReceiptSignatory(new PersonReference(FIRST), "předseda správní rady", NOW));
        flushAndClear();

        assertThat(signatories.current()).contains(new ReceiptSignatory(new PersonReference(FIRST), "předseda správní rady", NOW));
        assertThat(lookup.signsReceipts(FIRST)).isTrue();
        assertThat(lookup.signsReceipts(SECOND)).isFalse();
    }

    @Test
    @DisplayName("Given a signatory chosen, when another person is chosen, then one row names the newer choice")
    void should_keep_one_row_when_chosen_again_given_earlier_signatory() {
        signatories.choose(new ReceiptSignatory(new PersonReference(FIRST), "předseda správní rady", NOW));
        flushAndClear();

        signatories.choose(new ReceiptSignatory(new PersonReference(SECOND), "místopředsedkyně", NOW.plusSeconds(60)));
        flushAndClear();

        assertThat(signatories.current()).contains(new ReceiptSignatory(new PersonReference(SECOND), "místopředsedkyně", NOW.plusSeconds(60)));
        assertThat(jdbc.sql("select count(*) from donation_receipt_signatory").query(Long.class).single()).isEqualTo(1L);
        assertThat(lookup.signsReceipts(FIRST)).isFalse();
    }

    @Test
    @DisplayName("Given the schema, when a second row is inserted, then the singleton constraint refuses it")
    void should_refuse_when_inserted_given_second_row() {
        assertThatThrownBy(() -> jdbc.sql("insert into donation_receipt_signatory (id, person_id, receipt_role, chosen_at) values (2, ?, 'x', now())")
                .param(FIRST).update())
                .hasMessageContaining("ck_donation_receipt_signatory_singleton");
    }

    private void flushAndClear() {
        entityManager.flush();
        entityManager.clear();
    }
}

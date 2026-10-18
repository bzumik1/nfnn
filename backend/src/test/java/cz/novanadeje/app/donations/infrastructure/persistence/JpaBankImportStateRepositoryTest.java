package cz.novanadeje.app.donations.infrastructure.persistence;

import cz.novanadeje.app.donations.domain.importing.BankImportState;
import cz.novanadeje.app.donations.domain.importing.BankImportStateRepository;
import cz.novanadeje.app.donations.domain.importing.ImportCoverage;
import cz.novanadeje.app.donations.domain.importing.ImportFailureKind;
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

import static cz.novanadeje.app.donations.infrastructure.persistence.BankPersistenceTestConfiguration.NOW;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(BankPersistenceTestConfiguration.class)
class JpaBankImportStateRepositoryTest {

    private static final Instant LATER = NOW.plusSeconds(3600);

    @Autowired
    private BankImportStateRepository states;
    @Autowired
    private EntityManager entityManager;
    @Autowired
    private JdbcClient jdbc;

    @Test
    @DisplayName("Given no stored state, when the current state is asked for, then it is the initial one at the clock's time")
    void should_be_initial_when_current_asked_given_no_row() {
        BankImportState state = states.current();

        assertThat(state.coverage()).isEqualTo(ImportCoverage.none());
        assertThat(state.lastAttemptedAt()).isEmpty();
        assertThat(state.updatedAt()).isEqualTo(NOW);
    }

    @Test
    @DisplayName("Given a covered and later failed state, when it is saved and read back, then every field survives in the single row")
    void should_keep_every_field_in_single_row_when_saved_twice() {
        BankImportState state = states.current();
        state.succeeded(new ImportCoverage(LocalDate.of(2026, 7, 20), LocalDate.of(2026, 10, 17)), NOW);
        states.save(state);
        flushAndClear();

        BankImportState stored = states.current();
        stored.failed(ImportFailureKind.RATE_LIMITED, "refused with HTTP 409", LATER);
        states.save(stored);
        flushAndClear();

        BankImportState reread = states.current();
        assertThat(reread.coverage()).isEqualTo(new ImportCoverage(LocalDate.of(2026, 7, 20), LocalDate.of(2026, 10, 17)));
        assertThat(reread.lastSucceededAt()).contains(NOW);
        assertThat(reread.lastAttemptedAt()).contains(LATER);
        assertThat(reread.lastFailureKind()).contains(ImportFailureKind.RATE_LIMITED);
        assertThat(reread.lastFailureMessage()).contains("refused with HTTP 409");
        assertThat(reread.updatedAt()).isEqualTo(LATER);
        assertThat(jdbc.sql("select count(*) from bank_import_state").query(Long.class).single()).isEqualTo(1L);
    }

    @Test
    @DisplayName("Given the schema, when a second state row is inserted, then the singleton check refuses it")
    void should_refuse_when_inserted_given_second_row() {
        assertThatThrownBy(() -> jdbc.sql("insert into bank_import_state (id, updated_at) values (2, now())").update())
                .hasMessageContaining("ck_bank_import_state_singleton");
    }

    @Test
    @DisplayName("Given the schema, when a coverage with only one bound is inserted, then the coverage check refuses it")
    void should_refuse_when_inserted_given_half_coverage() {
        assertThatThrownBy(() -> jdbc.sql("insert into bank_import_state (id, covered_from, updated_at) values (1, current_date, now())").update())
                .hasMessageContaining("ck_bank_import_state_coverage");
    }

    private void flushAndClear() {
        entityManager.flush();
        entityManager.clear();
    }
}

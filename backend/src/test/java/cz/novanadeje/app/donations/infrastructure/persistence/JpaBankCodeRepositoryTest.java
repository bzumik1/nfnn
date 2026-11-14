package cz.novanadeje.app.donations.infrastructure.persistence;

import cz.novanadeje.app.PersistenceTest;
import cz.novanadeje.app.donations.domain.bankcode.BankCode;
import cz.novanadeje.app.donations.domain.bankcode.BankCodeList;
import cz.novanadeje.app.donations.domain.bankcode.BankCodeListState;
import cz.novanadeje.app.donations.domain.bankcode.BankCodeRepository;
import cz.novanadeje.app.donations.domain.bankcode.BankName;
import cz.novanadeje.app.donations.domain.bankcode.CzechBank;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;

import java.util.List;
import java.util.Optional;
import java.util.stream.IntStream;

import static cz.novanadeje.app.donations.infrastructure.persistence.BankPersistenceTestConfiguration.NOW;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@PersistenceTest
class JpaBankCodeRepositoryTest {

    private static final String LAST_MODIFIED = "Fri, 25 Sep 2026 11:10:55 GMT";

    @Autowired
    private BankCodeRepository repository;
    @Autowired
    private EntityManager entityManager;
    @Autowired
    private JdbcClient jdbc;

    @Test
    @DisplayName("Given no stored list, when the list and its state are read, then both are empty")
    void should_be_empty_when_read_given_nothing_stored() {
        assertThat(repository.findAll()).isEmpty();
        assertThat(repository.state()).isEqualTo(BankCodeListState.none());
    }

    @Test
    @DisplayName("Given a stored list, when another list is stored with its state, then only the new codes remain, ordered by code, with their names, beside the new state")
    void should_keep_only_new_codes_when_stored_given_stored_list() {
        repository.store(list(0, 30, "Stará"), BankCodeListState.none().fetched(NOW, LAST_MODIFIED));
        flushAndClear();

        repository.store(list(10, 25, "Nová"), repository.state().fetched(NOW.plusSeconds(60)));
        flushAndClear();

        List<CzechBank> banks = repository.findAll();
        assertThat(banks).hasSize(25).extracting(bank -> bank.code().value()).isSorted().startsWith("0010").endsWith("0034");
        assertThat(banks).first().isEqualTo(new CzechBank(new BankCode("0010"), new BankName("Nová banka 10")));
        assertThat(jdbc.sql("select count(*) from bank_code").query(Integer.class).single()).isEqualTo(25);
        assertThat(repository.state()).isEqualTo(new BankCodeListState(Optional.of(NOW.plusSeconds(60)), Optional.empty(), Optional.of(NOW.plusSeconds(60))));
    }

    @Test
    @DisplayName("Given a state saved twice, when it is read back, then the single row holds the latest fetch, check and last modification")
    void should_keep_latest_state_in_single_row_when_saved_twice() {
        repository.save(BankCodeListState.none().fetched(NOW, LAST_MODIFIED));
        flushAndClear();
        repository.save(repository.state().unchanged(NOW.plusSeconds(3600)));
        flushAndClear();

        assertThat(repository.state()).isEqualTo(new BankCodeListState(Optional.of(NOW), Optional.of(LAST_MODIFIED), Optional.of(NOW.plusSeconds(3600))));
        assertThat(jdbc.sql("select count(*) from bank_code_list_state").query(Integer.class).single()).isEqualTo(1);
    }

    @Test
    @DisplayName("Given a code that is not four digits, when it is written directly, then the database refuses it")
    void should_refuse_when_written_given_invalid_code() {
        assertThatThrownBy(() -> jdbc.sql("insert into bank_code (code, name) values ('08a0', 'Banka')").update())
                .hasMessageContaining("ck_bank_code_code");
    }

    @Test
    @DisplayName("Given a second state row, when it is written directly, then the database refuses it")
    void should_refuse_when_written_given_second_state_row() {
        assertThatThrownBy(() -> jdbc.sql("insert into bank_code_list_state (id) values (2)").update())
                .hasMessageContaining("ck_bank_code_list_state_singleton");
    }

    @ParameterizedTest
    @ValueSource(strings = {"Banka\u0007", "Banka\nnová", "Banka\u007f"})
    @DisplayName("Given a name with a control character, when it is written directly, then the database refuses it")
    void should_refuse_when_written_given_name_with_control_character(String name) {
        assertThatThrownBy(() -> jdbc.sql("insert into bank_code (code, name) values ('0800', ?)").param(name).update())
                .hasMessageContaining("ck_bank_code_name");
    }

    @ParameterizedTest
    @ValueSource(strings = {"", " ", "   ", "Pá, 25 zář 2026", "Fri,\r\n25 Sep"})
    @DisplayName("Given a last modification that is blank or not printable ASCII, when it is written directly, then the database refuses it")
    void should_refuse_when_written_given_unusable_last_modified(String lastModified) {
        assertThatThrownBy(() -> jdbc.sql("insert into bank_code_list_state (id, fetched_at, source_last_modified, checked_at) values (1, now(), ?, now())")
                .param(lastModified).update())
                .hasMessageContaining("ck_bank_code_list_state_source_last_modified");
    }

    @Test
    @DisplayName("Given a last modification without a fetch time, when it is written directly, then the database refuses it")
    void should_refuse_when_written_given_last_modified_without_fetch() {
        assertThatThrownBy(() -> jdbc.sql("insert into bank_code_list_state (id, source_last_modified, checked_at) values (1, ?, now())")
                .param(LAST_MODIFIED).update())
                .hasMessageContaining("ck_bank_code_list_state_last_modified_after_fetch");
    }

    private static BankCodeList list(int first, int count, String prefix) {
        return new BankCodeList(IntStream.range(first, first + count)
                .mapToObj(index -> new CzechBank(new BankCode("%04d".formatted(index)), new BankName(prefix + " banka " + index)))
                .toList());
    }

    private void flushAndClear() {
        entityManager.flush();
        entityManager.clear();
    }
}

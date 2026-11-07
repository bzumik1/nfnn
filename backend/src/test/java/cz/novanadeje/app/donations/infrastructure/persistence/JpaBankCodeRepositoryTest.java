package cz.novanadeje.app.donations.infrastructure.persistence;

import cz.novanadeje.app.donations.domain.bankcode.BankCode;
import cz.novanadeje.app.donations.domain.bankcode.BankCodeList;
import cz.novanadeje.app.donations.domain.bankcode.BankCodeListState;
import cz.novanadeje.app.donations.domain.bankcode.BankCodeRepository;
import cz.novanadeje.app.donations.domain.bankcode.BankName;
import cz.novanadeje.app.donations.domain.bankcode.CzechBank;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

import java.util.List;
import java.util.Optional;
import java.util.stream.IntStream;

import static cz.novanadeje.app.donations.infrastructure.persistence.BankPersistenceTestConfiguration.NOW;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(BankPersistenceTestConfiguration.class)
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
    @DisplayName("Given a stored list, when another list replaces it, then only the new codes remain, ordered by code, with their names")
    void should_keep_only_new_codes_when_replaced_given_stored_list() {
        repository.replaceAll(list(0, 30, "Stará"));
        flushAndClear();

        repository.replaceAll(list(10, 25, "Nová"));
        flushAndClear();

        List<CzechBank> banks = repository.findAll();
        assertThat(banks).hasSize(25).extracting(bank -> bank.code().value()).isSorted().startsWith("0010").endsWith("0034");
        assertThat(banks).first().isEqualTo(new CzechBank(new BankCode("0010"), new BankName("Nová banka 10")));
        assertThat(jdbc.sql("select count(*) from bank_code").query(Integer.class).single()).isEqualTo(25);
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

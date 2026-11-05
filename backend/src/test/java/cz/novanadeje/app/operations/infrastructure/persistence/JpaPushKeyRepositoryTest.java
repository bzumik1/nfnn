package cz.novanadeje.app.operations.infrastructure.persistence;

import cz.novanadeje.app.operations.domain.push.PushKey;
import cz.novanadeje.app.operations.domain.push.PushKeyRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.transaction.TestTransaction;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(OperationsPersistenceTestConfiguration.class)
class JpaPushKeyRepositoryTest {

    private static final PushKey FIRST = new PushKey("B" + "a".repeat(86), "v1:first", Instant.parse("2026-11-05T09:00:00Z"));
    private static final PushKey SECOND = new PushKey("B" + "b".repeat(86), "v1:second", Instant.parse("2026-11-05T10:00:00Z"));

    @Autowired
    private PushKeyRepository keys;

    @Autowired
    private PlatformTransactionManager transactionManager;

    @Autowired
    private JdbcClient jdbc;

    @Test
    @DisplayName("Given a key read in one transaction and replaced by another that committed, when the first reads it locked, then it gets the replaced key and holds the row")
    void should_read_committed_replacement_and_hold_row_when_read_locked_given_key_read_before() {
        TestTransaction.end();
        TransactionTemplate separately = new TransactionTemplate(transactionManager);
        separately.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        separately.executeWithoutResult(status -> keys.insertIfAbsent(FIRST));
        try {
            separately.executeWithoutResult(status -> {
                assertThat(keys.find()).contains(FIRST);
                separately.executeWithoutResult(other -> keys.replace(SECOND));

                assertThat(keys.findLocked()).contains(SECOND);
                assertThatThrownBy(() -> separately.executeWithoutResult(other -> jdbc
                        .sql("select id from operations_push_key where id = 1 for update nowait").query().listOfRows()))
                        .isInstanceOf(DataAccessException.class)
                        .hasMessageContaining("could not obtain lock on row");
            });
        } finally {
            separately.executeWithoutResult(status -> jdbc.sql("delete from operations_push_key").update());
        }
    }

    @Test
    @DisplayName("Given no push key, when it is read plain or locked, then there is none")
    void should_find_nothing_when_read_given_no_key() {
        assertThat(keys.find()).isEmpty();
        assertThat(keys.findLocked()).isEmpty();
    }

    @Test
    @DisplayName("Given a stored push key, when a second key is inserted if absent, then the first one stays")
    void should_keep_first_key_when_inserted_again_given_a_stored_key() {
        keys.insertIfAbsent(FIRST);

        keys.insertIfAbsent(SECOND);

        assertThat(keys.find()).contains(FIRST);
        assertThat(keys.findLocked()).contains(FIRST);
    }

    @Test
    @DisplayName("Given a stored push key, when it is replaced, then the new key is the one row")
    void should_hold_new_key_when_replaced_given_a_stored_key() {
        keys.insertIfAbsent(FIRST);

        keys.replace(SECOND);

        assertThat(keys.find()).contains(SECOND);
    }
}

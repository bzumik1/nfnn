package cz.novanadeje.app.operations.infrastructure.persistence;

import cz.novanadeje.app.TestcontainersConfiguration;
import cz.novanadeje.app.operations.domain.backup.RestoreRecordRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.context.annotation.Import;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import({TestcontainersConfiguration.class, JpaRestoreRecordRepository.class})
class JpaRestoreRecordRepositoryTest {

    private static final Instant NOW = Instant.parse("2026-10-23T19:30:00Z");

    @Autowired
    private RestoreRecordRepository records;

    @Test
    @DisplayName("Given a restore request not recorded yet, when it is recorded twice, then only the first records it")
    void should_record_once_when_recorded_twice_given_a_request() {
        assertThat(records.recordOnce("019a1b2c-0000-7000-8000-000000000001", NOW)).isTrue();
        assertThat(records.recordOnce("019a1b2c-0000-7000-8000-000000000001", NOW.plusSeconds(60))).isFalse();
        assertThat(records.recordOnce("019a1b2c-0000-7000-8000-000000000002", NOW)).isTrue();
    }
}

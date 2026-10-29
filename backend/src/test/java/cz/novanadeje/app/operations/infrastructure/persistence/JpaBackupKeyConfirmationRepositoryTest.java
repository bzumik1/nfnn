package cz.novanadeje.app.operations.infrastructure.persistence;

import cz.novanadeje.app.TestcontainersConfiguration;
import cz.novanadeje.app.operations.domain.backup.BackupKey;
import cz.novanadeje.app.operations.domain.backup.BackupKeyConfirmation;
import cz.novanadeje.app.operations.domain.backup.BackupKeyConfirmationRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.context.annotation.Import;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import({TestcontainersConfiguration.class, JpaBackupKeyConfirmationRepository.class})
class JpaBackupKeyConfirmationRepositoryTest {

    private static final BackupKey KEY = new BackupKey("AGE-SECRET-KEY-1R45A984EXXAFC85YZSYGY9R6XJTD4E9AKY65ZCRGPDQ89E7ANW8QKT6GWH");
    private static final BackupKey OTHER_KEY = new BackupKey("AGE-SECRET-KEY-1ARXU2VF0GAFA8YLTUXNPDZE0UV33WNCJJEUWM3C2RKSR7A829JTS8HRKXT");

    @Autowired
    private BackupKeyConfirmationRepository confirmations;

    @Test
    @DisplayName("Given no key confirmed, when the confirmation is read, then there is none")
    void should_find_nothing_when_read_given_nothing_confirmed() {
        assertThat(confirmations.find()).isEmpty();
    }

    @Test
    @DisplayName("Given a key confirmed in the first setup and later another one by an administrator, when it is read, then the latest confirmation comes back")
    void should_round_trip_when_saved_given_a_later_confirmation() {
        confirmations.save(BackupKeyConfirmation.of(KEY, Instant.parse("2026-10-28T08:00:00Z"), Optional.empty()));
        BackupKeyConfirmation later = BackupKeyConfirmation.of(OTHER_KEY, Instant.parse("2026-10-29T09:30:00Z"),
                Optional.of(UUID.fromString("019a0000-0000-7000-8000-000000000002")));

        confirmations.save(later);

        assertThat(confirmations.find()).contains(later);
        assertThat(confirmations.find().orElseThrow().confirms(OTHER_KEY)).isTrue();
        assertThat(confirmations.find().orElseThrow().confirms(KEY)).isFalse();
    }
}

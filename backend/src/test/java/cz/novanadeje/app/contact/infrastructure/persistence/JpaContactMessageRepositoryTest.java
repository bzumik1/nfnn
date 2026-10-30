package cz.novanadeje.app.contact.infrastructure.persistence;

import cz.novanadeje.app.contact.domain.ContactMessage;
import cz.novanadeje.app.contact.domain.ContactMessageRepository;
import cz.novanadeje.app.shared.domain.EmailAddress;
import jakarta.persistence.EntityManager;
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
@Import(ContactPersistenceTestConfiguration.class)
class JpaContactMessageRepositoryTest {

    private static final Instant CUTOFF = Instant.parse("2025-10-23T10:00:00Z");

    @Autowired
    private ContactMessageRepository messages;
    @Autowired
    private ContactMessageJpaRepository rows;
    @Autowired
    private EntityManager entityManager;

    @Test
    @DisplayName("Given messages received before, at and after the cutoff, when the older ones are deleted, then only those before the cutoff go")
    void should_delete_only_messages_received_before_cutoff_when_deleted_given_messages_around_cutoff() {
        messages.save(message(CUTOFF.minusSeconds(1)));
        messages.save(message(CUTOFF));
        messages.save(message(CUTOFF.plusSeconds(1)));
        flushAndClear();

        int deleted = messages.deleteReceivedBefore(CUTOFF);
        flushAndClear();

        assertThat(deleted).isEqualTo(1);
        assertThat(rows.findAll()).extracting(ContactMessageJpaEntity::toDomain).extracting(ContactMessage::receivedAt)
                .containsExactlyInAnyOrder(CUTOFF, CUTOFF.plusSeconds(1));
    }

    private static ContactMessage message(Instant receivedAt) {
        return ContactMessage.receive("Jana Nováková", new EmailAddress("jana@example.cz"), "Dobrý den.", receivedAt);
    }

    private void flushAndClear() {
        entityManager.flush();
        entityManager.clear();
    }
}

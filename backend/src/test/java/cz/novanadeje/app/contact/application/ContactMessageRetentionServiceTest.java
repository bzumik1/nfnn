package cz.novanadeje.app.contact.application;

import cz.novanadeje.app.contact.domain.ContactMessageRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ContactMessageRetentionServiceTest {

    private static final Instant NOW = Instant.parse("2027-10-18T01:30:00Z");

    private final ContactMessageRepository messages = mock(ContactMessageRepository.class);

    @Test
    @DisplayName("Given a retention of 365 days, when expired messages are deleted, then the messages received more than 365 days before now are deleted")
    void should_delete_messages_received_before_365_days_ago_when_deleting_given_default_retention() {
        ContactMessageRetentionService service = service(Duration.ofDays(365));
        when(messages.deleteReceivedBefore(Instant.parse("2026-10-18T01:30:00Z"))).thenReturn(2);

        ContactMessagePurge purge = service.deleteExpiredMessages();

        verify(messages).deleteReceivedBefore(Instant.parse("2026-10-18T01:30:00Z"));
        assertThat(purge).isEqualTo(new ContactMessagePurge(Instant.parse("2026-10-18T01:30:00Z"), 2));
    }

    @Test
    @DisplayName("Given a retention of 30 days, when expired messages are deleted, then the cutoff moves with the configured retention")
    void should_cut_off_at_configured_retention_when_deleting_given_thirty_days() {
        ContactMessageRetentionService service = service(Duration.ofDays(30));

        ContactMessagePurge purge = service.deleteExpiredMessages();

        verify(messages).deleteReceivedBefore(Instant.parse("2027-09-18T01:30:00Z"));
        assertThat(purge.deleted()).isZero();
    }

    private ContactMessageRetentionService service(Duration maxAge) {
        return new ContactMessageRetentionService(messages, new ContactMessageRetentionProperties(maxAge), Clock.fixed(NOW, ZoneOffset.UTC));
    }
}

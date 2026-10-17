package cz.novanadeje.app.contact.application;

import cz.novanadeje.app.contact.application.event.ContactMessageReceived;
import cz.novanadeje.app.contact.domain.ContactMessage;
import cz.novanadeje.app.contact.domain.ContactMessageId;
import cz.novanadeje.app.contact.domain.ContactMessageRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class SubmitContactMessageServiceTest {

    private static final Instant NOW = Instant.parse("2026-10-17T10:00:00Z");

    @Mock
    private ContactMessageRepository repository;

    @Mock
    private ApplicationEventPublisher events;

    @Test
    @DisplayName("Given a valid command, when submitted, then the message is stored and a ContactMessageReceived event carries its content")
    void should_store_message_and_publish_event_when_submitted_given_valid_command() {
        SubmitContactMessageService service = new SubmitContactMessageService(repository, events, Clock.fixed(NOW, ZoneOffset.UTC));

        ContactMessageId id = service.submit(new SubmitContactMessageCommand("Jana Nováková", "jana@example.cz", "Dobrý den."));

        ArgumentCaptor<ContactMessage> stored = ArgumentCaptor.forClass(ContactMessage.class);
        verify(repository).save(stored.capture());
        assertThat(stored.getValue().id()).isEqualTo(id);
        assertThat(stored.getValue().receivedAt()).isEqualTo(NOW);

        ArgumentCaptor<ContactMessageReceived> published = ArgumentCaptor.forClass(ContactMessageReceived.class);
        verify(events).publishEvent(published.capture());
        assertThat(published.getValue().messageId()).isEqualTo(id);
        assertThat(published.getValue().senderName()).isEqualTo("Jana Nováková");
        assertThat(published.getValue().senderEmail().value()).isEqualTo("jana@example.cz");
        assertThat(published.getValue().body()).isEqualTo("Dobrý den.");
        assertThat(published.getValue().receivedAt()).isEqualTo(NOW);
    }
}

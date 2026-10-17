package cz.novanadeje.app.contact.application;

import cz.novanadeje.app.contact.application.event.ContactMessageReceived;
import cz.novanadeje.app.contact.domain.ContactMessage;
import cz.novanadeje.app.contact.domain.ContactMessageId;
import cz.novanadeje.app.contact.domain.ContactMessageRepository;
import cz.novanadeje.app.shared.domain.EmailAddress;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;

@Service
public class SubmitContactMessageService {

    private final ContactMessageRepository messages;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    public SubmitContactMessageService(ContactMessageRepository messages, ApplicationEventPublisher events, Clock clock) {
        this.messages = messages;
        this.events = events;
        this.clock = clock;
    }

    @Transactional
    public ContactMessageId submit(SubmitContactMessageCommand command) {
        ContactMessage message = ContactMessage.receive(
                command.senderName(),
                new EmailAddress(command.senderEmail()),
                command.body(),
                clock.instant()
        );
        messages.save(message);
        events.publishEvent(new ContactMessageReceived(
                message.id(),
                message.senderName(),
                message.senderEmail(),
                message.body(),
                message.receivedAt()
        ));
        return message.id();
    }
}

package cz.novanadeje.app.contact.application;

import cz.novanadeje.app.contact.domain.ContactMessageRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;

@Service
public class ContactMessageRetentionService {

    private final ContactMessageRepository messages;
    private final ContactMessageRetentionProperties properties;
    private final Clock clock;

    public ContactMessageRetentionService(ContactMessageRepository messages, ContactMessageRetentionProperties properties, Clock clock) {
        this.messages = messages;
        this.properties = properties;
        this.clock = clock;
    }

    @Transactional
    public ContactMessagePurge deleteExpiredMessages() {
        Instant cutoff = clock.instant().minus(properties.maxAge());
        return new ContactMessagePurge(cutoff, messages.deleteReceivedBefore(cutoff));
    }
}

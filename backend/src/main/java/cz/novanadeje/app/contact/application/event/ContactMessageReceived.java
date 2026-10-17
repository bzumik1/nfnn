package cz.novanadeje.app.contact.application.event;

import cz.novanadeje.app.contact.domain.ContactMessageId;
import cz.novanadeje.app.shared.domain.EmailAddress;

import java.time.Instant;

public record ContactMessageReceived(
        ContactMessageId messageId,
        String senderName,
        EmailAddress senderEmail,
        String body,
        Instant receivedAt
) {
}

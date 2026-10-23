package cz.novanadeje.app.contact.infrastructure.persistence;

import cz.novanadeje.app.contact.domain.ContactMessage;
import cz.novanadeje.app.contact.domain.ContactMessageId;
import cz.novanadeje.app.shared.domain.EmailAddress;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "contact_message")
class ContactMessageJpaEntity {

    @Id
    private UUID id;

    @Column(name = "sender_name", nullable = false, length = ContactMessage.MAX_SENDER_NAME_LENGTH)
    private String senderName;

    @Column(name = "sender_email", nullable = false, length = 254)
    private String senderEmail;

    @Column(name = "body", nullable = false, length = ContactMessage.MAX_BODY_LENGTH)
    private String body;

    @Column(name = "received_at", nullable = false)
    private Instant receivedAt;

    protected ContactMessageJpaEntity() {
    }

    static ContactMessageJpaEntity fromDomain(ContactMessage message) {
        ContactMessageJpaEntity entity = new ContactMessageJpaEntity();
        entity.id = message.id().value();
        entity.senderName = message.senderName();
        entity.senderEmail = message.senderEmail().value();
        entity.body = message.body();
        entity.receivedAt = message.receivedAt();
        return entity;
    }

    ContactMessage toDomain() {
        return new ContactMessage(new ContactMessageId(id), senderName, new EmailAddress(senderEmail), body, receivedAt);
    }
}

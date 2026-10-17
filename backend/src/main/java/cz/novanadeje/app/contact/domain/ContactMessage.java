package cz.novanadeje.app.contact.domain;

import cz.novanadeje.app.shared.domain.EmailAddress;

import java.time.Instant;

public record ContactMessage(
        ContactMessageId id,
        String senderName,
        EmailAddress senderEmail,
        String body,
        Instant receivedAt
) {

    public static final int MAX_SENDER_NAME_LENGTH = 120;
    public static final int MAX_BODY_LENGTH = 5000;

    public ContactMessage {
        if (id == null) {
            throw new IllegalArgumentException("Contact message id is required");
        }
        senderName = requireText(senderName, "Sender name", MAX_SENDER_NAME_LENGTH);
        if (senderEmail == null) {
            throw new IllegalArgumentException("Sender email is required");
        }
        body = requireText(body, "Message body", MAX_BODY_LENGTH);
        if (receivedAt == null) {
            throw new IllegalArgumentException("Received time is required");
        }
    }

    public static ContactMessage receive(String senderName, EmailAddress senderEmail, String body, Instant receivedAt) {
        return new ContactMessage(ContactMessageId.newId(receivedAt), senderName, senderEmail, body, receivedAt);
    }

    private static String requireText(String value, String label, int maxLength) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(label + " is required");
        }
        String trimmed = value.trim();
        if (trimmed.length() > maxLength) {
            throw new IllegalArgumentException(label + " must not exceed " + maxLength + " characters");
        }
        return trimmed;
    }
}

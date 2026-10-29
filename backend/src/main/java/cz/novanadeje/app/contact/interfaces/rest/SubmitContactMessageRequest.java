package cz.novanadeje.app.contact.interfaces.rest;

import cz.novanadeje.app.contact.application.SubmitContactMessageCommand;
import cz.novanadeje.app.contact.domain.ContactMessage;
import cz.novanadeje.app.shared.domain.EmailAddress;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

record SubmitContactMessageRequest(
        @NotBlank @Size(max = ContactMessage.MAX_SENDER_NAME_LENGTH) String fullName,
        @NotBlank @Email @Pattern(regexp = EmailAddress.SHAPE_REGEX) @Size(max = 254) String email,
        @NotBlank @Size(max = ContactMessage.MAX_BODY_LENGTH) String message,
        String website
) {

    boolean isFilledByBot() {
        return website != null && !website.isBlank();
    }

    SubmitContactMessageCommand toCommand() {
        return new SubmitContactMessageCommand(fullName, email, message);
    }
}

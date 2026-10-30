package cz.novanadeje.app.content.interfaces.rest;

import cz.novanadeje.app.content.application.people.PersonCommand;
import cz.novanadeje.app.content.domain.media.MediaId;
import cz.novanadeje.app.content.domain.people.PersonDetails;
import cz.novanadeje.app.content.domain.people.PersonEmails;
import cz.novanadeje.app.shared.domain.EmailAddress;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.util.Optional;
import java.util.UUID;

public record PersonRequest(
        @NotBlank @Size(max = PersonDetails.MAX_NAME_LENGTH) String name,
        @Size(max = PersonDetails.MAX_ROLE_LENGTH) String role,
        boolean onBoard,
        @Size(max = PersonDetails.MAX_BOARD_NOTE_LENGTH) String boardNote,
        boolean featured,
        UUID portraitId,
        @Size(max = EmailAddress.MAX_LENGTH) @Pattern(regexp = "^\\s*$|" + EmailAddress.SHAPE_REGEX) String personalEmail,
        @Size(max = EmailAddress.MAX_LENGTH) @Pattern(regexp = "^\\s*$|" + EmailAddress.SHAPE_REGEX) String fundEmail) {

    PersonCommand toCommand() {
        return new PersonCommand(name, Optional.ofNullable(role), onBoard, Optional.ofNullable(boardNote), featured,
                Optional.ofNullable(portraitId).map(MediaId::new), new PersonEmails(email(personalEmail), email(fundEmail)));
    }

    private static Optional<EmailAddress> email(String value) {
        return Optional.ofNullable(value).filter(text -> !text.isBlank()).map(EmailAddress::new);
    }
}

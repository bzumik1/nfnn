package cz.novanadeje.app.content.domain.people;

import cz.novanadeje.app.content.domain.media.MediaId;

import java.util.Optional;

public record PersonDetails(String name, Optional<String> role, boolean onBoard, Optional<String> boardNote, boolean featured,
                            Optional<MediaId> portrait, PersonEmails emails) {

    public static final int MAX_NAME_LENGTH = 100;
    public static final int MAX_ROLE_LENGTH = 120;
    public static final int MAX_BOARD_NOTE_LENGTH = 60;

    public PersonDetails {
        if (name == null || role == null || boardNote == null || portrait == null || emails == null) {
            throw new IllegalArgumentException("A person has a name, a role, a board note, a portrait and e-mails (each optional one even when absent)");
        }
        name = name.strip();
        if (name.isEmpty() || name.length() > MAX_NAME_LENGTH) {
            throw new IllegalArgumentException("The name of a person has 1 to " + MAX_NAME_LENGTH + " characters");
        }
        role = text(role, "role", MAX_ROLE_LENGTH);
        boardNote = text(boardNote, "board note", MAX_BOARD_NOTE_LENGTH);
    }

    private static Optional<String> text(Optional<String> value, String what, int maxLength) {
        Optional<String> stripped = value.map(String::strip).filter(text -> !text.isEmpty());
        if (stripped.isPresent() && stripped.get().length() > maxLength) {
            throw new IllegalArgumentException("The " + what + " of a person is at most " + maxLength + " characters");
        }
        return stripped;
    }
}

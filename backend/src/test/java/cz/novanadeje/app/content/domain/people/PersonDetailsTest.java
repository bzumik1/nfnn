package cz.novanadeje.app.content.domain.people;

import cz.novanadeje.app.content.domain.media.MediaId;
import cz.novanadeje.app.shared.domain.EmailAddress;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class PersonDetailsTest {

    private static final MediaId PORTRAIT = MediaId.newId(Instant.parse("2026-10-30T09:00:00Z"));

    @Test
    @DisplayName("Given a name, a role and a board note with spaces around, when the details are made, then all three are trimmed")
    void should_trim_the_texts_when_made_given_spaces_around() {
        PersonDetails details = new PersonDetails("  Eva Vzorová ", Optional.of(" Zakladatelka "), true, Optional.of(" předsedkyně "), true,
                Optional.of(PORTRAIT), PersonEmails.NONE);

        assertThat(details.name()).isEqualTo("Eva Vzorová");
        assertThat(details.role()).contains("Zakladatelka");
        assertThat(details.boardNote()).contains("předsedkyně");
        assertThat(details.portrait()).contains(PORTRAIT);
    }

    @Test
    @DisplayName("Given a blank role and a blank board note, when the details are made, then they have neither")
    void should_have_no_role_and_note_when_made_given_blank_texts() {
        PersonDetails details = new PersonDetails("Eva Vzorová", Optional.of("  "), false, Optional.of(""), false, Optional.empty(), PersonEmails.NONE);

        assertThat(details.role()).isEmpty();
        assertThat(details.boardNote()).isEmpty();
    }

    @Test
    @DisplayName("Given a blank name, when the details are made, then they are refused")
    void should_refuse_the_details_when_made_given_a_blank_name() {
        assertThatThrownBy(() -> new PersonDetails("   ", Optional.empty(), false, Optional.empty(), false, Optional.empty(), PersonEmails.NONE))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("Given texts one character over their limits, when the details are made, then they are refused, and texts at the limits pass")
    void should_refuse_a_text_when_made_given_one_character_over_its_limit() {
        String name = "x".repeat(PersonDetails.MAX_NAME_LENGTH);
        String role = "x".repeat(PersonDetails.MAX_ROLE_LENGTH);
        String note = "x".repeat(PersonDetails.MAX_BOARD_NOTE_LENGTH);

        assertThat(new PersonDetails(name, Optional.of(role), true, Optional.of(note), false, Optional.empty(), PersonEmails.NONE).name()).isEqualTo(name);
        assertThatThrownBy(() -> new PersonDetails(name + "x", Optional.empty(), false, Optional.empty(), false, Optional.empty(), PersonEmails.NONE))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new PersonDetails("Eva", Optional.of(role + "x"), false, Optional.empty(), false, Optional.empty(), PersonEmails.NONE))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new PersonDetails("Eva", Optional.empty(), true, Optional.of(note + "x"), false, Optional.empty(), PersonEmails.NONE))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("Given a personal and a fund e-mail, when the details are made, then both are kept apart")
    void should_keep_both_emails_when_made_given_a_personal_and_a_fund_email() {
        PersonEmails emails = new PersonEmails(Optional.of(new EmailAddress("eva@example.org")), Optional.of(new EmailAddress("eva@nfnn.cz")));

        PersonDetails details = new PersonDetails("Eva Vzorová", Optional.empty(), true, Optional.empty(), true, Optional.empty(), emails);

        assertThat(details.emails().personal()).contains(new EmailAddress("eva@example.org"));
        assertThat(details.emails().fund()).contains(new EmailAddress("eva@nfnn.cz"));
    }

    @Test
    @DisplayName("Given no e-mails, when the e-mails are made, then they are refused, and the empty e-mails have neither")
    void should_refuse_the_emails_when_made_given_null_and_have_neither_when_none() {
        assertThatThrownBy(() -> new PersonEmails(null, Optional.empty())).isInstanceOf(IllegalArgumentException.class);
        assertThat(PersonEmails.NONE.personal()).isEmpty();
        assertThat(PersonEmails.NONE.fund()).isEmpty();
    }
}

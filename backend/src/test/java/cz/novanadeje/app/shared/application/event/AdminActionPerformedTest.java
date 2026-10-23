package cz.novanadeje.app.shared.application.event;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class AdminActionPerformedTest {

    private static final UUID ADMIN = UUID.fromString("01a18e56-bdb0-775a-bd0a-a60756831369");
    private static final Instant AT = Instant.parse("2026-10-22T10:00:00Z");

    @Test
    @DisplayName("Given an action and details with spaces around them, when the event is created, then both are trimmed")
    void should_trim_texts_when_created_given_padded_action_and_details() {
        AdminActionPerformed event = new AdminActionPerformed(ADMIN, " PAIR_PAYMENT ", Optional.empty(), " paired 1001 to Jana ", AT);

        assertThat(event.action()).isEqualTo("PAIR_PAYMENT");
        assertThat(event.details()).isEqualTo("paired 1001 to Jana");
    }

    @Test
    @DisplayName("Given a blank action, when the event is created, then it is refused")
    void should_refuse_when_created_given_blank_action() {
        assertThatThrownBy(() -> new AdminActionPerformed(ADMIN, " ", Optional.empty(), "details", AT))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("action");
    }

    @Test
    @DisplayName("Given overlong details, when the event is created, then it is refused")
    void should_refuse_when_created_given_overlong_details() {
        assertThatThrownBy(() -> new AdminActionPerformed(ADMIN, "PAIR_PAYMENT", Optional.empty(), "x".repeat(2001), AT))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("2000");
    }

    @Test
    @DisplayName("Given no administrator, when the event is created, then it is refused")
    void should_refuse_when_created_given_no_admin() {
        assertThatThrownBy(() -> new AdminActionPerformed(null, "PAIR_PAYMENT", Optional.empty(), "details", AT))
                .isInstanceOf(IllegalArgumentException.class);
    }
}

package cz.novanadeje.app.donations.domain.importing;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ImportAlertIdTest {

    private static final Instant NOW = Instant.parse("2026-11-15T09:00:00Z");

    @Test
    @DisplayName("Given an instant, when a new import alert id is taken, then it is a version 7 UUID of that millisecond")
    void should_be_a_version_7_uuid_of_the_instant_when_taken_given_an_instant() {
        ImportAlertId id = ImportAlertId.newId(NOW);

        assertThat(id.value().version()).isEqualTo(7);
        assertThat(id.value().getMostSignificantBits() >>> 16).isEqualTo(NOW.toEpochMilli());
    }

    @Test
    @DisplayName("Given an import alert id, when it is printed, then it prints only its UUID, as the log line of an undelivered alert did before")
    void should_print_only_its_uuid_when_printed_given_an_id() {
        UUID value = UUID.fromString("01a18e56-bdb0-775a-bd0a-a60756831301");

        assertThat(new ImportAlertId(value)).hasToString("01a18e56-bdb0-775a-bd0a-a60756831301");
    }

    @Test
    @DisplayName("Given no UUID, when an import alert id is made, then it is refused")
    void should_refuse_when_made_given_no_uuid() {
        assertThatThrownBy(() -> new ImportAlertId(null)).isInstanceOf(IllegalArgumentException.class);
    }
}

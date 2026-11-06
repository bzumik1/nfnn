package cz.novanadeje.app.content.domain.donateband;

import cz.novanadeje.app.content.domain.media.MediaId;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class DonateBandTest {

    private static final Instant BEFORE = Instant.parse("2026-11-04T09:00:00Z");
    private static final Instant NOW = Instant.parse("2026-11-05T09:00:00Z");
    private static final MediaId FIRST = MediaId.newId(BEFORE);
    private static final MediaId SECOND = MediaId.newId(NOW);

    @Test
    @DisplayName("Given a band without a photo, when a photo is shown, then the band carries it and the time of the change")
    void should_carry_the_photo_when_shown_given_no_photo() {
        DonateBand shown = DonateBand.withoutPhoto(BEFORE).show(Optional.of(photo(FIRST)), NOW);

        assertThat(shown.image()).contains(FIRST);
        assertThat(shown.updatedAt()).isEqualTo(NOW);
    }

    @Test
    @DisplayName("Given a band with a photo, when another photo is shown or the photo is removed, then the first one is the image it leaves, and showing it again with another description leaves nothing")
    void should_leave_the_old_image_when_replaced_or_removed_given_a_photo() {
        DonateBand current = DonateBand.withoutPhoto(BEFORE).show(Optional.of(photo(FIRST)), BEFORE);

        assertThat(current.imageLeftBy(current.show(Optional.of(photo(SECOND)), NOW))).contains(FIRST);
        assertThat(current.imageLeftBy(current.show(Optional.empty(), NOW))).contains(FIRST);
        assertThat(current.imageLeftBy(current.show(Optional.of(new DonateBandPhoto(FIRST, Optional.of("Jiný popis"))), NOW))).isEmpty();
    }

    @Test
    @DisplayName("Given a blank description or one over 200 characters, when a band photo is built, then the blank one is dropped and the long one refused")
    void should_drop_a_blank_and_refuse_a_long_description_when_built() {
        assertThat(new DonateBandPhoto(FIRST, Optional.of("   ")).alt()).isEmpty();
        assertThat(new DonateBandPhoto(FIRST, Optional.of(" Děti u stolu ")).alt()).contains("Děti u stolu");
        assertThatThrownBy(() -> new DonateBandPhoto(FIRST, Optional.of("x".repeat(201)))).hasMessageContaining("200");
    }

    private static DonateBandPhoto photo(MediaId image) {
        return new DonateBandPhoto(image, Optional.of("Popis"));
    }
}

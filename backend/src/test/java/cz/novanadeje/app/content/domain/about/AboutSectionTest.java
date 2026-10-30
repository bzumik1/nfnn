package cz.novanadeje.app.content.domain.about;

import cz.novanadeje.app.content.domain.media.MediaId;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;

class AboutSectionTest {

    private static final Instant BEFORE = Instant.parse("2026-10-29T09:00:00Z");
    private static final Instant NOW = Instant.parse("2026-10-30T09:00:00Z");
    private static final MediaId FIRST = MediaId.newId(BEFORE);
    private static final MediaId SECOND = MediaId.newId(NOW);

    @Test
    @DisplayName("Given a section without a photo, when a photo is shown, then the section carries it and the time of the change")
    void should_carry_the_photo_when_shown_given_no_photo() {
        AboutSection shown = AboutSection.withoutPhoto(BEFORE).show(Optional.of(photo(FIRST)), NOW);

        assertThat(shown.image()).contains(FIRST);
        assertThat(shown.updatedAt()).isEqualTo(NOW);
    }

    @Test
    @DisplayName("Given a section with a photo, when another photo is shown, then the first one is the image it leaves")
    void should_leave_the_old_image_when_another_is_shown_given_a_photo() {
        AboutSection current = AboutSection.withoutPhoto(BEFORE).show(Optional.of(photo(FIRST)), BEFORE);

        AboutSection next = current.show(Optional.of(photo(SECOND)), NOW);

        assertThat(current.imageLeftBy(next)).contains(FIRST);
    }

    @Test
    @DisplayName("Given a section with a photo, when the same photo is shown with other texts or the photo is removed, then it leaves nothing or the photo")
    void should_leave_the_image_only_when_removed_given_a_photo() {
        AboutSection current = AboutSection.withoutPhoto(BEFORE).show(Optional.of(photo(FIRST)), BEFORE);

        AboutSection retexted = current.show(Optional.of(new AboutPhoto(FIRST, Optional.of("Jiný popis"), Optional.empty())), NOW);
        AboutSection removed = current.show(Optional.empty(), NOW);

        assertThat(current.imageLeftBy(retexted)).isEmpty();
        assertThat(current.imageLeftBy(removed)).contains(FIRST);
        assertThat(removed.image()).isEmpty();
    }

    @Test
    @DisplayName("Given a section without a photo, when the photo is removed, then it leaves nothing")
    void should_leave_nothing_when_removed_given_no_photo() {
        AboutSection current = AboutSection.withoutPhoto(BEFORE);

        assertThat(current.imageLeftBy(current.show(Optional.empty(), NOW))).isEmpty();
    }

    private static AboutPhoto photo(MediaId image) {
        return new AboutPhoto(image, Optional.of("Popis"), Optional.of("Popisek"));
    }
}

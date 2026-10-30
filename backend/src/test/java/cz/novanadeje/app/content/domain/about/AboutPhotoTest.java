package cz.novanadeje.app.content.domain.about;

import cz.novanadeje.app.content.domain.media.MediaId;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class AboutPhotoTest {

    private static final MediaId IMAGE = MediaId.newId(Instant.parse("2026-10-30T09:00:00Z"));

    @Test
    @DisplayName("Given a description and a caption with spaces around, when the photo is made, then both are trimmed")
    void should_trim_the_texts_when_made_given_spaces_around() {
        AboutPhoto photo = new AboutPhoto(IMAGE, Optional.of("  Chlapec v náručí  "), Optional.of(" Kde to začalo "));

        assertThat(photo.alt()).contains("Chlapec v náručí");
        assertThat(photo.caption()).contains("Kde to začalo");
    }

    @Test
    @DisplayName("Given a blank description and caption, when the photo is made, then it has neither")
    void should_have_no_texts_when_made_given_blank_texts() {
        AboutPhoto photo = new AboutPhoto(IMAGE, Optional.of("   "), Optional.of(""));

        assertThat(photo.alt()).isEmpty();
        assertThat(photo.caption()).isEmpty();
    }

    @Test
    @DisplayName("Given a description or a caption of 201 characters, when the photo is made, then it is refused, and 200 characters pass")
    void should_refuse_a_text_when_made_given_more_than_200_characters() {
        String longest = "x".repeat(AboutPhoto.MAX_ALT_LENGTH);
        String tooLong = longest + "x";

        assertThat(new AboutPhoto(IMAGE, Optional.of(longest), Optional.of(longest)).alt()).contains(longest);
        assertThatThrownBy(() -> new AboutPhoto(IMAGE, Optional.of(tooLong), Optional.empty())).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new AboutPhoto(IMAGE, Optional.empty(), Optional.of(tooLong))).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("Given no image, when the photo is made, then it is refused")
    void should_refuse_the_photo_when_made_given_no_image() {
        assertThatThrownBy(() -> new AboutPhoto(null, Optional.empty(), Optional.empty())).isInstanceOf(IllegalArgumentException.class);
    }
}

package cz.novanadeje.app.content.domain.media;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class MediaVariantTest {

    private static final byte[] WEBP = "RIFF-webp-480".getBytes();

    @Test
    @DisplayName("Given WebP bytes, when a media variant is made, then it keeps a copy and hands out copies")
    void should_keep_copy_when_created_given_webp_bytes() {
        byte[] bytes = WEBP.clone();

        MediaVariant variant = new MediaVariant(480, 342, bytes);
        bytes[0] = 0;
        variant.webp()[1] = 0;

        assertThat(variant.webp()).isEqualTo(WEBP);
        assertThat(variant.size()).isEqualTo(WEBP.length);
    }

    @Test
    @DisplayName("Given two media variants of the same size and bytes, when compared, then they are equal, and a different size or byte makes them differ")
    void should_be_equal_when_compared_given_same_size_and_bytes() {
        assertThat(new MediaVariant(480, 342, WEBP)).isEqualTo(new MediaVariant(480, 342, WEBP.clone()))
                .hasSameHashCodeAs(new MediaVariant(480, 342, WEBP.clone()));
        assertThat(new MediaVariant(480, 342, WEBP)).isNotEqualTo(new MediaVariant(480, 343, WEBP))
                .isNotEqualTo(new MediaVariant(480, 342, "RIFF-webp-481".getBytes()));
    }

    @Test
    @DisplayName("Given a media variant, when printed, then its size shows and its bytes do not")
    void should_print_size_only_when_printed_given_media_variant() {
        assertThat(new MediaVariant(480, 342, WEBP)).hasToString("MediaVariant[480x342, " + WEBP.length + " bytes]");
    }

    @Test
    @DisplayName("Given no bytes or a size that is not positive, when a media variant is made, then it is refused")
    void should_refuse_when_created_given_no_bytes_or_no_size() {
        assertThatThrownBy(() -> new MediaVariant(480, 342, new byte[0])).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new MediaVariant(480, 342, null)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new MediaVariant(0, 342, WEBP)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new MediaVariant(480, 0, WEBP)).isInstanceOf(IllegalArgumentException.class);
    }
}

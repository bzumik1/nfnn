package cz.novanadeje.app.donations.domain.receipt;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.Arrays;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class SignatureImageTest {

    static final byte[] PNG = {(byte) 0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n', 0, 0, 0, 13};

    @Test
    @DisplayName("Given PNG bytes within the limits, when a signature image is made, then it keeps a copy of the bytes and its size")
    void should_keep_copy_when_created_given_png_within_limits() {
        byte[] bytes = PNG.clone();

        SignatureImage image = new SignatureImage(bytes, 600, 200);
        bytes[11] = 99;

        assertThat(image.png()).isEqualTo(PNG);
        assertThat(image.width()).isEqualTo(600);
        assertThat(image.height()).isEqualTo(200);
        assertThat(image.digest()).isEqualTo(ContentDigest.of(PNG));
    }

    @Test
    @DisplayName("Given two signature images of the same bytes and size, when compared, then they are equal")
    void should_be_equal_when_compared_given_same_bytes_and_size() {
        assertThat(new SignatureImage(PNG, 600, 200)).isEqualTo(new SignatureImage(PNG.clone(), 600, 200))
                .hasSameHashCodeAs(new SignatureImage(PNG.clone(), 600, 200));
        assertThat(new SignatureImage(PNG, 600, 200)).isNotEqualTo(new SignatureImage(PNG, 600, 201));
    }

    @Test
    @DisplayName("Given bytes that are not a PNG, when a signature image is made, then it is refused")
    void should_refuse_when_created_given_bytes_not_png() {
        byte[] jpeg = {(byte) 0xff, (byte) 0xd8, (byte) 0xff, (byte) 0xe0, 0, 0, 0, 0};

        assertThatThrownBy(() -> new SignatureImage(jpeg, 600, 200)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new SignatureImage(new byte[0], 600, 200)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new SignatureImage(null, 600, 200)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("Given a size outside 1 to 1200 by 1 to 600 pixels, when a signature image is made, then it is refused")
    void should_refuse_when_created_given_size_outside_limits() {
        assertThatThrownBy(() -> new SignatureImage(PNG, SignatureImage.MAX_WIDTH + 1, 200)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new SignatureImage(PNG, 600, SignatureImage.MAX_HEIGHT + 1)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new SignatureImage(PNG, 0, 200)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new SignatureImage(PNG, 600, 0)).isInstanceOf(IllegalArgumentException.class);
        assertThat(Arrays.asList(SignatureImage.MAX_WIDTH, SignatureImage.MAX_HEIGHT)).containsExactly(1200, 600);
    }

    @Test
    @DisplayName("Given a signature image, when printed, then its size shows and its bytes do not")
    void should_print_size_only_when_printed_given_signature_image() {
        assertThat(new SignatureImage(PNG, 600, 200)).hasToString("SignatureImage[600x200, " + ContentDigest.of(PNG) + "]");
    }
}

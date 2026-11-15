package cz.novanadeje.app.donations.domain.receipt;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class StoredReceiptImageTest {

    private static final byte[] PNG = {(byte) 0x89, 'P', 'N', 'G', 1, 2, 3};

    @Test
    @DisplayName("Given two stored receipt images of the same bytes and type, when they are compared, then they are equal with the same hash and print no bytes")
    void should_be_equal_when_compared_given_the_same_bytes_and_type() {
        StoredReceiptImage first = new StoredReceiptImage(PNG.clone(), ReceiptImageMediaType.PNG);
        StoredReceiptImage second = new StoredReceiptImage(PNG.clone(), ReceiptImageMediaType.PNG);

        assertThat(first).isEqualTo(second).hasSameHashCodeAs(second);
        assertThat(first.toString()).isEqualTo("StoredReceiptImage[7 bytes, image/png]");
    }

    @Test
    @DisplayName("Given a stored receipt image, when the caller changes the array it gave or got back, then the image keeps its bytes")
    void should_keep_its_bytes_when_the_caller_changes_them_given_a_stored_receipt_image() {
        byte[] given = PNG.clone();
        StoredReceiptImage image = new StoredReceiptImage(given, ReceiptImageMediaType.PNG);

        given[1] = 'X';
        image.content()[2] = 'X';

        assertThat(image.content()).containsExactly(PNG);
    }

    @Test
    @DisplayName("Given no media type, when a stored receipt image is made, then it is refused")
    void should_be_refused_when_made_given_no_media_type() {
        assertThatThrownBy(() -> new StoredReceiptImage(PNG.clone(), null)).isInstanceOf(IllegalArgumentException.class);
    }
}

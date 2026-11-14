package cz.novanadeje.app.donations.domain.receipt;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class StoredReceiptImageTest {

    private static final byte[] PNG = {(byte) 0x89, 'P', 'N', 'G', 1, 2, 3};

    @Test
    @DisplayName("Given two stored receipt images of the same bytes and type, when they are compared, then they are equal with the same hash and print no bytes")
    void should_be_equal_when_compared_given_the_same_bytes_and_type() {
        StoredReceiptImage first = new StoredReceiptImage(PNG.clone(), "image/png");
        StoredReceiptImage second = new StoredReceiptImage(PNG.clone(), "image/png");

        assertThat(first).isEqualTo(second).hasSameHashCodeAs(second);
        assertThat(first.toString()).isEqualTo("StoredReceiptImage[7 bytes, image/png]");
    }

    @Test
    @DisplayName("Given a stored receipt image, when the caller changes the array it gave or got back, then the image keeps its bytes")
    void should_keep_its_bytes_when_the_caller_changes_them_given_a_stored_receipt_image() {
        byte[] given = PNG.clone();
        StoredReceiptImage image = new StoredReceiptImage(given, "image/png");

        given[1] = 'X';
        image.content()[2] = 'X';

        assertThat(image.content()).containsExactly(PNG);
    }
}

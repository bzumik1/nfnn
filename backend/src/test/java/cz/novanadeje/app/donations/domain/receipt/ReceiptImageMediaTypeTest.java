package cz.novanadeje.app.donations.domain.receipt;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;

class ReceiptImageMediaTypeTest {

    @ParameterizedTest
    @CsvSource({"image/png, PNG", "image/jpeg, JPEG", "application/json, VECTOR_JSON"})
    @DisplayName("Given a media type a receipt image is stored with, when it is read, then it is that closed value and spells the same")
    void should_be_the_closed_value_when_read_given_a_stored_media_type(String stored, ReceiptImageMediaType expected) {
        assertThat(ReceiptImageMediaType.fromValue(stored)).contains(expected);
        assertThat(expected.value()).isEqualTo(stored);
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "image/svg+xml", "text/html", "IMAGE/PNG", "image/png ", "image/png; charset=utf-8"})
    @DisplayName("Given a media type outside the closed set, when it is read, then it is no receipt image media type")
    void should_be_absent_when_read_given_a_media_type_outside_the_closed_set(String stored) {
        assertThat(ReceiptImageMediaType.fromValue(stored)).isEmpty();
    }
}

package cz.novanadeje.app.content.domain.media;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class FocalPointTest {

    @Test
    @DisplayName("Given the corners and the centre of a photo, when a focal point is made there, then it keeps its percentages")
    void should_keep_the_percentages_when_made_given_the_corners_and_the_centre() {
        assertThat(new FocalPoint(0, 0)).extracting(FocalPoint::x, FocalPoint::y).containsExactly(0, 0);
        assertThat(new FocalPoint(100, 100)).extracting(FocalPoint::x, FocalPoint::y).containsExactly(100, 100);
        assertThat(new FocalPoint(42, 18)).extracting(FocalPoint::x, FocalPoint::y).containsExactly(42, 18);
    }

    @ParameterizedTest(name = "{0} % from the left, {1} % from the top")
    @CsvSource({"-1, 50", "101, 50", "50, -1", "50, 101"})
    @DisplayName("Given a spot outside the photo, when a focal point is made there, then it is refused")
    void should_refuse_when_made_given_a_spot_outside_the_photo(int x, int y) {
        assertThatThrownBy(() -> new FocalPoint(x, y)).isInstanceOf(IllegalArgumentException.class);
    }
}

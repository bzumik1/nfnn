package cz.novanadeje.app.content.domain.media;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class MediaVariantWidthsTest {

    private static final MediaVariantWidths STORED = new MediaVariantWidths(List.of(1440, 480, 960));

    @ParameterizedTest(name = "{0} px wanted, {1} px served")
    @CsvSource({"1, 480", "480, 480", "481, 960", "700, 960", "960, 960", "961, 1440", "1440, 1440", "1441, 1440", "5000, 1440"})
    @DisplayName("Given a photo stored in three widths, when a width is wanted, then the narrowest at least that wide is chosen, else the widest")
    void should_choose_the_narrowest_wide_enough_when_wanted_given_three_widths(int wanted, int chosen) {
        assertThat(STORED.atLeast(wanted)).isEqualTo(chosen);
    }

    @Test
    @DisplayName("Given a photo stored in three widths in any order, when its largest width is asked for, then it is the widest")
    void should_answer_the_widest_when_largest_asked_given_three_widths() {
        assertThat(STORED.largest()).isEqualTo(1440);
    }

    @Test
    @DisplayName("Given no width, a width twice or a width below one, when the stored widths are made, then they are refused")
    void should_refuse_when_made_given_no_repeated_or_non_positive_widths() {
        assertThatThrownBy(() -> new MediaVariantWidths(List.of())).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new MediaVariantWidths(List.of(480, 480))).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new MediaVariantWidths(List.of(0, 480))).isInstanceOf(IllegalArgumentException.class);
    }
}

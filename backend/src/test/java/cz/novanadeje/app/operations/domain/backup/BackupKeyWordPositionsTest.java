package cz.novanadeje.app.operations.domain.backup;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;

import java.util.HashSet;
import java.util.List;
import java.util.Random;
import java.util.Set;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class BackupKeyWordPositionsTest {

    @Test
    @DisplayName("Given a random source, when positions are drawn many times, then each draw is three different positions in order and every position comes up")
    void should_draw_three_ordered_positions_when_drawn() {
        Random random = new Random(20261029);
        Set<Integer> seen = new HashSet<>();

        for (int draw = 0; draw < 500; draw++) {
            List<Integer> positions = BackupKeyWordPositions.draw(random).positions();
            assertThat(positions).hasSize(3).isSorted().doesNotHaveDuplicates().allSatisfy(position -> assertThat(position).isBetween(1, 24));
            seen.addAll(positions);
        }

        assertThat(seen).hasSize(24);
    }

    @ParameterizedTest
    @MethodSource("wrongPositions")
    @DisplayName("Given positions that are not three different words of the key, when they are made, then they are refused")
    void should_refuse_positions_when_made_given_wrong_ones(List<Integer> positions) {
        assertThatThrownBy(() -> new BackupKeyWordPositions(positions)).isInstanceOf(BackupKeyCheckMismatch.class);
    }

    @Test
    @DisplayName("Given checked words, when their positions are read, then they are the positions in order")
    void should_read_positions_in_order_when_read_from_checks() {
        List<BackupKeyWordCheck> checks = List.of(new BackupKeyWordCheck(17, "a"), new BackupKeyWordCheck(3, "b"), new BackupKeyWordCheck(9, "c"));

        assertThat(BackupKeyWordPositions.of(checks)).isEqualTo(new BackupKeyWordPositions(List.of(3, 9, 17)));
    }

    static Stream<List<Integer>> wrongPositions() {
        return Stream.of(List.of(1, 2), List.of(1, 2, 3, 4), List.of(0, 2, 3), List.of(1, 2, 25), List.of(5, 5, 6));
    }
}

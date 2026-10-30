package cz.novanadeje.app.support;

import cz.novanadeje.app.operations.application.backup.BackupKeyWordChallenges;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class BackupKeyWordDrawsTest {

    @Test
    @DisplayName("Given two word challenges reseeded for a recorded scenario, when each draws positions, then both draw the same ones every time")
    void should_draw_the_same_positions_when_two_reseeded_word_challenges_draw() {
        BackupKeyWordChallenges first = new BackupKeyWordChallenges();
        BackupKeyWordChallenges second = new BackupKeyWordChallenges();

        BackupKeyWordDraws.reseed(first);
        BackupKeyWordDraws.reseed(second);

        assertThat(first.draw()).isEqualTo(second.draw());
        assertThat(first.draw()).isEqualTo(second.draw());
        BackupKeyWordDraws.reseed(first);
        BackupKeyWordDraws.reseed(second);
        assertThat(second.draw()).isEqualTo(first.draw());
    }
}

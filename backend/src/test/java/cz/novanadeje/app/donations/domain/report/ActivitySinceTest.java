package cz.novanadeje.app.donations.domain.report;

import cz.novanadeje.app.shared.domain.Money;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ActivitySinceTest {

    private static final Instant FROM = Instant.parse("2026-10-28T20:14:00Z");

    @Test
    @DisplayName("Given five new payments of which two wait, when the paired part is asked for, then it is the other three with the rest of the total")
    void should_answer_the_rest_as_paired_when_asked_given_some_unpaired() {
        ActivitySince activity = new ActivitySince(FROM, new Tally(5, Money.czk(1250000)), new Tally(2, Money.czk(500000)), 3);

        assertThat(activity.paired()).isEqualTo(new Tally(3, Money.czk(750000)));
        assertThat(activity.isEmpty()).isFalse();
    }

    @Test
    @DisplayName("Given no payment and no registration, when it is asked whether anything happened, then nothing did")
    void should_be_empty_when_asked_given_nothing_new() {
        ActivitySince activity = new ActivitySince(FROM, new Tally(0, Money.czk(0)), new Tally(0, Money.czk(0)), 0);

        assertThat(activity.isEmpty()).isTrue();
        assertThat(activity.paired()).isEqualTo(new Tally(0, Money.czk(0)));
    }

    @Test
    @DisplayName("Given more unpaired payments than new ones, when the activity is built, then it is refused")
    void should_refuse_when_built_given_more_unpaired_than_new() {
        assertThatThrownBy(() -> new ActivitySince(FROM, new Tally(1, Money.czk(100)), new Tally(2, Money.czk(200)), 0))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("unpaired");
    }

    @Test
    @DisplayName("Given a negative count of new donors, when the activity is built, then it is refused")
    void should_refuse_when_built_given_negative_new_donors() {
        assertThatThrownBy(() -> new ActivitySince(FROM, new Tally(0, Money.czk(0)), new Tally(0, Money.czk(0)), -1))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("New donors");
    }
}

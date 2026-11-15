package cz.novanadeje.app.shared.domain;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class UuidV7Test {

    @Test
    @DisplayName("Given nothing, when an id is generated, then it is a version 7, variant 2 UUID")
    void should_produce_version_7_variant_2_uuid_when_generated() {
        UUID uuid = UuidV7.generate(Instant.parse("2026-10-17T10:00:00Z"));

        assertThat(uuid.version()).isEqualTo(7);
        assertThat(uuid.variant()).isEqualTo(2);
    }

    @Test
    @DisplayName("Given a later instant, when an id is generated, then it sorts after the earlier one")
    void should_order_by_time_when_generated_given_later_instant() {
        UUID earlier = UuidV7.generate(Instant.parse("2026-10-17T10:00:00Z"));
        UUID later = UuidV7.generate(Instant.parse("2026-10-17T10:00:01Z"));

        assertThat(earlier.toString()).isLessThan(later.toString());
    }

    @Test
    @DisplayName("Given the same instant, when two ids are generated, then they differ")
    void should_differ_when_generated_twice_given_same_instant() {
        Instant instant = Instant.parse("2026-10-17T10:00:00Z");

        assertThat(UuidV7.generate(instant)).isNotEqualTo(UuidV7.generate(instant));
    }

    @Test
    @DisplayName("Given the same instant, when ids are generated one after another, then they sort in the order they were generated")
    void should_sort_in_generation_order_when_generated_given_same_instant() {
        Instant instant = Instant.parse("2026-10-17T10:00:00Z");
        List<String> generated = new ArrayList<>();
        for (int i = 0; i < 100; i++) {
            generated.add(UuidV7.generate(instant).toString());
        }

        assertThat(generated).isSortedAccordingTo(String::compareTo);
    }

    @Test
    @DisplayName("Given the same instant, when ids are generated one after another, then the random tail of the next one does not follow from the previous one")
    void should_keep_random_tail_when_generated_given_same_instant() {
        Instant instant = Instant.parse("2026-10-17T10:00:00Z");
        UUID previous = UuidV7.generate(instant);
        int followers = 0;
        for (int i = 0; i < 100; i++) {
            UUID next = UuidV7.generate(instant);
            if (next.getLeastSignificantBits() == previous.getLeastSignificantBits() + 1) {
                followers++;
            }
            previous = next;
        }

        assertThat(followers).isZero();
    }
}

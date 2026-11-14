package cz.novanadeje.app.shared.application.event;

import cz.novanadeje.app.shared.application.event.StoredDataChanged.LiveFeed;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class LiveFeedTest {

    @Test
    @DisplayName("Given lower-case words joined by hyphens, when a feed is created, then it keeps the name and the audience")
    void should_keep_name_and_audience_when_created_given_hyphenated_lower_case_words() {
        LiveFeed feed = new LiveFeed("bank-import", LiveFeed.Audience.EVERYONE);

        assertThat(feed.name()).isEqualTo("bank-import");
        assertThat(feed.audience()).isEqualTo(LiveFeed.Audience.EVERYONE);
    }

    @Test
    @DisplayName("Given a name of the longest length allowed, when a feed is created, then it is accepted")
    void should_accept_when_created_given_name_of_maximum_length() {
        String longest = "a".repeat(LiveFeed.MAXIMUM_NAME_LENGTH);

        assertThat(new LiveFeed(longest, LiveFeed.Audience.DONOR).name()).isEqualTo(longest);
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "Donations", "bank_import", "bank import", "-payments", "payments-", "bank--import", "feed2", "dárky"})
    @DisplayName("Given a name that is not lower-case words joined by hyphens, when a feed is created, then it is refused without the name in the message")
    void should_refuse_without_the_name_when_created_given_malformed_name(String name) {
        assertThatThrownBy(() -> new LiveFeed(name, LiveFeed.Audience.ADMINISTRATION))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("name")
                .satisfies(refusal -> assertThat(name.isEmpty() || !refusal.getMessage().contains(name)).isTrue());
    }

    @Test
    @DisplayName("Given a name longer than allowed, when a feed is created, then it is refused")
    void should_refuse_when_created_given_overlong_name() {
        String overlong = "a".repeat(LiveFeed.MAXIMUM_NAME_LENGTH + 1);

        assertThatThrownBy(() -> new LiveFeed(overlong, LiveFeed.Audience.DONOR))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining(String.valueOf(LiveFeed.MAXIMUM_NAME_LENGTH));
    }

    @Test
    @DisplayName("Given no name or no audience, when a feed is created, then it is refused")
    void should_refuse_when_created_given_missing_name_or_audience() {
        assertThatThrownBy(() -> new LiveFeed(null, LiveFeed.Audience.DONOR)).isInstanceOf(NullPointerException.class);
        assertThatThrownBy(() -> new LiveFeed("payments", null)).isInstanceOf(NullPointerException.class);
    }
}

package cz.novanadeje.app.donations.domain.bankcode;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.Instant;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class BankCodeListStateTest {

    private static final Instant NOW = Instant.parse("2026-11-07T08:00:00Z");
    private static final String LAST_MODIFIED = "Fri, 25 Sep 2026 11:10:55 GMT";

    @Test
    @DisplayName("Given a list never fetched, when it is asked whether a refresh is due, then it is")
    void should_be_due_when_asked_given_never_fetched() {
        assertThat(BankCodeListState.none().isDue(NOW)).isTrue();
        assertThat(BankCodeListState.none().ifModifiedSince()).isEmpty();
    }

    @Test
    @DisplayName("Given a list checked exactly 7 days ago, when it is asked whether a refresh is due, then it is not, and a moment later it is")
    void should_be_due_only_after_seven_days_when_asked_given_checked_before() {
        BankCodeListState state = BankCodeListState.none().fetched(NOW.minus(Duration.ofDays(7)), LAST_MODIFIED);

        assertThat(state.isDue(NOW)).isFalse();
        assertThat(state.isDue(NOW.plusSeconds(1))).isTrue();
    }

    @Test
    @DisplayName("Given a fetched list, when the source answers unchanged, then the check moves and the fetch time and last modification stay")
    void should_move_only_check_when_unchanged_given_fetched_list() {
        BankCodeListState fetched = BankCodeListState.none().fetched(NOW.minus(Duration.ofDays(8)), LAST_MODIFIED);

        BankCodeListState checked = fetched.unchanged(NOW);

        assertThat(checked.fetchedAt()).contains(NOW.minus(Duration.ofDays(8)));
        assertThat(checked.ifModifiedSince()).contains(LAST_MODIFIED);
        assertThat(checked.checkedAt()).contains(NOW);
        assertThat(checked.isDue(NOW)).isFalse();
    }

    @Test
    @DisplayName("Given a list fetched with a last modification, when it is fetched again without one, then nothing is sent as last modified")
    void should_forget_last_modified_when_fetched_given_no_header() {
        BankCodeListState state = BankCodeListState.none().fetched(NOW.minusSeconds(60), LAST_MODIFIED).fetched(NOW);

        assertThat(state.fetchedAt()).contains(NOW);
        assertThat(state.checkedAt()).contains(NOW);
        assertThat(state.ifModifiedSince()).isEmpty();
    }

    @Test
    @DisplayName("Given a last modification longer than 64 characters or with a non-ASCII or control character, when a list is fetched, then it is not kept")
    void should_drop_last_modified_when_fetched_given_unusable_header() {
        for (String unusable : new String[]{"x".repeat(65), "Pá, 25 zář 2026", "Fri,\r\n25 Sep", "", " "}) {
            assertThat(BankCodeListState.none().fetched(NOW, unusable).ifModifiedSince()).isEmpty();
        }
    }

    @Test
    @DisplayName("Given a stored last modification that is not usable, when the state is reconstituted, then it is refused")
    void should_refuse_when_reconstituted_given_unusable_last_modified() {
        assertThatThrownBy(() -> new BankCodeListState(Optional.of(NOW), Optional.of("x".repeat(65)), Optional.of(NOW)))
                .isInstanceOf(IllegalArgumentException.class);
    }
}

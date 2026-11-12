package cz.novanadeje.app.donations.application.bankcode;

import cz.novanadeje.app.donations.domain.bankcode.BankCode;
import cz.novanadeje.app.donations.domain.bankcode.BankCodeList;
import cz.novanadeje.app.donations.domain.bankcode.BankName;
import cz.novanadeje.app.donations.domain.bankcode.CzechBank;
import cz.novanadeje.app.support.FakeBankCodeSource;
import cz.novanadeje.app.support.MutableClock;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.stream.IntStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class BankCodeRefreshServiceTest {

    private static final Instant START = Instant.parse("2026-11-09T04:40:00Z");
    private static final String LAST_MODIFIED = "Fri, 25 Sep 2026 11:10:55 GMT";

    private final MutableClock clock = new MutableClock(START, ZoneOffset.UTC);
    private final InMemoryBankCodeRepository repository = new InMemoryBankCodeRepository();
    private final FakeBankCodeSource source = new FakeBankCodeSource();
    private final BankCodeRefreshService refreshes = new BankCodeRefreshService(source, new BankCodeListRecorder(repository, clock), clock);
    private final BankCodeListService lists = new BankCodeListService(repository);

    @Test
    @DisplayName("Given a list never fetched, when the list is read, then it is empty and has no fetch time")
    void should_be_empty_when_read_given_never_fetched() {
        BankCodeListView view = lists.list();

        assertThat(view.fetchedAt()).isEmpty();
        assertThat(view.banks()).isEmpty();
    }

    @Test
    @DisplayName("Given the source publishes a list, when it is refreshed, then the list is stored with the fetch time and the source's last modification")
    void should_store_list_when_refreshed_given_published_list() {
        source.publish(list(25), LAST_MODIFIED);

        BankCodeRefresh refresh = refreshes.refresh();

        assertThat(refresh).isEqualTo(BankCodeRefresh.fetched(25));
        assertThat(lists.list().banks()).hasSize(25);
        assertThat(lists.list().fetchedAt()).contains(START);
        assertThat(repository.state().sourceLastModified()).contains(LAST_MODIFIED);
        assertThat(source.askedIfModifiedSince()).containsExactly(Optional.empty());
    }

    @Test
    @DisplayName("Given a stored list, when it is refreshed and the source has not changed it, then the list and its fetch time stay and the check moves")
    void should_keep_list_when_refreshed_given_unchanged_source() {
        source.publish(list(25), LAST_MODIFIED);
        refreshes.refresh();
        clock.advance(Duration.ofDays(7));

        BankCodeRefresh refresh = refreshes.refresh();

        assertThat(refresh).isEqualTo(BankCodeRefresh.unchanged());
        assertThat(lists.list().banks()).hasSize(25);
        assertThat(lists.list().fetchedAt()).contains(START);
        assertThat(repository.state().checkedAt()).contains(START.plus(Duration.ofDays(7)));
        assertThat(source.askedIfModifiedSince()).containsExactly(Optional.empty(), Optional.of(LAST_MODIFIED));
    }

    @Test
    @DisplayName("Given a stored list, when a refresh fails, then the failure comes back and the stored list and its state stay")
    void should_keep_stored_list_when_refresh_fails() {
        source.publish(list(25), LAST_MODIFIED);
        refreshes.refresh();
        clock.advance(Duration.ofDays(8));
        source.failWith("status 503");

        assertThatThrownBy(refreshes::refresh).isInstanceOf(BankCodeSourceUnavailable.class).hasMessage("status 503");

        assertThat(lists.list().banks()).hasSize(25);
        assertThat(repository.state().checkedAt()).contains(START);
        assertThat(refreshes.isDue()).isTrue();
    }

    @Test
    @DisplayName("Given a list never fetched, when it is asked whether a refresh is due, then it is")
    void should_be_due_when_asked_given_never_fetched() {
        assertThat(refreshes.isDue()).isTrue();
    }

    static BankCodeList list(int count) {
        return new BankCodeList(IntStream.range(0, count)
                .mapToObj(index -> new CzechBank(new BankCode("%04d".formatted(index * 10)), new BankName("Banka " + index)))
                .toList());
    }
}

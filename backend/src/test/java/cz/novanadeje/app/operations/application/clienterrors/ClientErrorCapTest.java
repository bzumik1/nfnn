package cz.novanadeje.app.operations.application.clienterrors;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import cz.novanadeje.app.operations.domain.clienterrors.ClientErrorBucket;
import cz.novanadeje.app.operations.domain.clienterrors.ClientErrorKind;
import cz.novanadeje.app.support.MutableClock;
import cz.novanadeje.app.support.RecordingResetTimer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;

import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.stream.IntStream;

import static org.assertj.core.api.Assertions.assertThat;

class ClientErrorCapTest {

    private static final Instant START = Instant.parse("2026-11-04T09:00:00Z");

    private final MutableClock clock = new MutableClock(START, ZoneOffset.UTC);
    private final RecordingResetTimer timer = new RecordingResetTimer();
    private final ClientErrorCap cap = new ClientErrorCap(clock, timer);
    private final Logger logger = (Logger) LoggerFactory.getLogger(ClientErrorReportService.LOGGER);
    private final ListAppender<ILoggingEvent> log = new ListAppender<>();

    @BeforeEach
    void captureLog() {
        log.start();
        logger.addAppender(log);
    }

    @AfterEach
    void releaseLog() {
        logger.detachAppender(log);
    }

    @Test
    @DisplayName("Given the general bucket, when more reports arrive in an hour than it holds, then exactly its limit is admitted")
    void should_admit_exactly_the_limit_when_more_arrive_given_the_general_bucket() {
        long admitted = IntStream.range(0, ClientErrorBucket.GENERAL.perHour() + 5).filter(report -> cap.admits(ClientErrorKind.UNEXPECTED)).count();

        assertThat(admitted).isEqualTo(ClientErrorBucket.GENERAL.perHour());
    }

    @Test
    @DisplayName("Given a full general bucket, when a protected kind arrives, then its own bucket admits it")
    void should_admit_protected_kind_when_it_arrives_given_a_full_general_bucket() {
        fill(ClientErrorKind.UNEXPECTED, ClientErrorBucket.GENERAL);

        assertThat(cap.admits(ClientErrorKind.CHUNK_LOAD)).isFalse();
        assertThat(cap.admits(ClientErrorKind.PDF_RENDER)).isTrue();
        assertThat(cap.admits(ClientErrorKind.PDF_LOAD)).isTrue();
        assertThat(cap.admits(ClientErrorKind.VERIFY_SIGNATURE)).isTrue();
    }

    @Test
    @DisplayName("Given a full protected bucket, when its kind and another protected kind arrive, then only the other one is admitted")
    void should_keep_protected_buckets_apart_when_one_is_full_given_reports() {
        fill(ClientErrorKind.PDF_RENDER, ClientErrorBucket.PDF_RENDER);

        assertThat(cap.admits(ClientErrorKind.PDF_RENDER)).isFalse();
        assertThat(cap.admits(ClientErrorKind.PDF_LOAD)).isTrue();
        assertThat(cap.admits(ClientErrorKind.UNEXPECTED)).isTrue();
    }

    @Test
    @DisplayName("Given a full bucket, when an hour has passed since its first report, then it admits again")
    void should_admit_again_when_the_hour_passed_given_a_full_bucket() {
        fill(ClientErrorKind.UNEXPECTED, ClientErrorBucket.GENERAL);

        clock.advance(Duration.ofMinutes(59).plusSeconds(59));
        assertThat(cap.admits(ClientErrorKind.UNEXPECTED)).isFalse();
        clock.advance(Duration.ofSeconds(1));
        assertThat(cap.admits(ClientErrorKind.UNEXPECTED)).isTrue();
    }

    @Test
    @DisplayName("Given reports dropped in an hour, when its end comes, then one warning names the bucket and the dropped count")
    void should_warn_once_with_the_count_when_the_hour_ends_given_dropped_reports() {
        fill(ClientErrorKind.UNEXPECTED, ClientErrorBucket.GENERAL);
        cap.admits(ClientErrorKind.UNEXPECTED);
        cap.admits(ClientErrorKind.QR_ENCODE);
        cap.admits(ClientErrorKind.UNEXPECTED);

        assertThat(timer.scheduled()).singleElement().extracting(RecordingResetTimer.Scheduled::when).isEqualTo(START.plus(ClientErrorCap.WINDOW));
        assertThat(log.list).isEmpty();
        timer.fireAll();

        assertThat(log.list).singleElement().satisfies(line -> {
            assertThat(line.getLevel()).isEqualTo(Level.WARN);
            assertThat(line.getFormattedMessage()).isEqualTo("Browser error reports over the hourly cap bucket=general dropped=3");
        });
    }

    @Test
    @DisplayName("Given no report dropped, when an hour passes, then nothing is scheduled and nothing is logged")
    void should_stay_silent_when_the_hour_passes_given_nothing_dropped() {
        cap.admits(ClientErrorKind.UNEXPECTED);

        assertThat(timer.scheduled()).isEmpty();
        assertThat(log.list).isEmpty();
    }

    @Test
    @DisplayName("Given two buckets overflowing in one hour, when the hour ends, then each names its own count")
    void should_warn_per_bucket_when_the_hour_ends_given_two_overflowing_buckets() {
        fill(ClientErrorKind.UNEXPECTED, ClientErrorBucket.GENERAL);
        fill(ClientErrorKind.VERIFY_SIGNATURE, ClientErrorBucket.VERIFY_SIGNATURE);
        cap.admits(ClientErrorKind.UNEXPECTED);
        cap.admits(ClientErrorKind.VERIFY_SIGNATURE);
        cap.admits(ClientErrorKind.VERIFY_SIGNATURE);

        timer.fireAll();

        assertThat(log.list).extracting(ILoggingEvent::getFormattedMessage).containsExactlyInAnyOrder(
                "Browser error reports over the hourly cap bucket=general dropped=1",
                "Browser error reports over the hourly cap bucket=verify-signature dropped=2");
    }

    @Test
    @DisplayName("Given an hour whose drops were counted, when the next hour overflows too, then it gets a warning of its own")
    void should_warn_again_when_the_next_hour_overflows_given_a_counted_hour() {
        fill(ClientErrorKind.UNEXPECTED, ClientErrorBucket.GENERAL);
        cap.admits(ClientErrorKind.UNEXPECTED);
        clock.advance(ClientErrorCap.WINDOW);
        timer.fireAll();
        fill(ClientErrorKind.UNEXPECTED, ClientErrorBucket.GENERAL);
        cap.admits(ClientErrorKind.UNEXPECTED);
        cap.admits(ClientErrorKind.UNEXPECTED);
        timer.fireAll();

        assertThat(log.list).extracting(ILoggingEvent::getFormattedMessage).containsExactly(
                "Browser error reports over the hourly cap bucket=general dropped=1",
                "Browser error reports over the hourly cap bucket=general dropped=2");
    }

    private void fill(ClientErrorKind kind, ClientErrorBucket bucket) {
        for (int report = 0; report < bucket.perHour(); report++) {
            assertThat(cap.admits(kind)).isTrue();
        }
    }
}

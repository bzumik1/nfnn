package cz.novanadeje.app.operations.application.receiptseed;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import cz.novanadeje.app.operations.application.restart.ApplicationRestarter;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.InOrder;
import org.slf4j.LoggerFactory;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class ReceiptSeedRenewalServiceTest {

    private final ReceiptSeedRequests seeds = mock(ReceiptSeedRequests.class);
    private final ReceiptSeedRequestsAtStart startRequests = mock(ReceiptSeedRequestsAtStart.class);
    private final ApplicationRestarter restarter = mock(ApplicationRestarter.class);
    private final ReceiptSeedRenewalService renewal = new ReceiptSeedRenewalService(seeds, startRequests, restarter);
    private final ListAppender<ILoggingEvent> lines = new ListAppender<>();

    @BeforeEach
    void captureLog() {
        lines.start();
        logger().addAppender(lines);
    }

    @AfterEach
    void releaseLog() {
        logger().detachAppender(lines);
    }

    @Test
    @DisplayName("Given the server's own key withdrawn, when the seed is renewed, then a new seed is requested for that key, a WARN says why, and only then the backend restarts once the async work, the administrators' notices among it, is done")
    void should_request_a_seed_then_restart_once_async_work_is_done_when_renewed_given_the_current_key() {
        when(seeds.requestNewSeedFor("21fe31df")).thenReturn(true);

        renewal.renewAfterWithdrawal("21fe31df", true);

        InOrder order = inOrder(seeds, restarter);
        order.verify(seeds).requestNewSeedFor("21fe31df");
        order.verify(restarter).restartAfterCommitOnceAsyncWorkIsDone();
        assertThat(lines.list).singleElement().satisfies(line -> {
            assertThat(line.getLevel()).isEqualTo(Level.WARN);
            assertThat(line.getFormattedMessage())
                    .isEqualTo("The receipt signing key 21fe31df of this server was withdrawn, so the backend restarts and its entrypoint generates a new seed");
        });
    }

    @Test
    @DisplayName("Given an earlier key withdrawn, when the seed is renewed, then no seed is requested and the backend keeps running")
    void should_request_nothing_and_keep_running_when_renewed_given_an_earlier_key() {
        renewal.renewAfterWithdrawal("39f713d0", false);

        verify(seeds, never()).requestNewSeedFor(anyString());
        verifyNoInteractions(restarter);
        assertThat(lines.list).isEmpty();
    }

    @Test
    @DisplayName("Given a request for a new seed that could not be left, when the seed is renewed, then the backend does not restart")
    void should_not_restart_when_renewed_given_the_request_could_not_be_left() {
        when(seeds.requestNewSeedFor("21fe31df")).thenReturn(false);

        renewal.renewAfterWithdrawal("21fe31df", true);

        verifyNoInteractions(restarter);
        assertThat(lines.list).isEmpty();
    }

    @Test
    @DisplayName("Given the server's own key found withdrawn at a start without a request for a new seed, when it is renewed at the start, then a new seed is requested, a WARN says why and the backend restarts once the async work is done")
    void should_request_a_seed_then_restart_when_renewed_at_start_given_no_request() {
        when(startRequests.requestNewSeedAtStartFor("21fe31df")).thenReturn(ReceiptSeedRequestsAtStart.StartRequest.REQUESTED);

        renewal.renewAtStart("21fe31df");

        InOrder order = inOrder(startRequests, restarter);
        order.verify(startRequests).requestNewSeedAtStartFor("21fe31df");
        order.verify(restarter).restartAfterCommitOnceAsyncWorkIsDone();
        assertThat(lines.list).singleElement().satisfies(line -> {
            assertThat(line.getLevel()).isEqualTo(Level.WARN);
            assertThat(line.getFormattedMessage()).isEqualTo("The receipt signing key 21fe31df of this server is withdrawn and no new seed was requested, "
                    + "so the backend restarts and its entrypoint generates a new seed");
        });
    }

    @Test
    @DisplayName("Given a request for a new seed that already waits, when the key is renewed at the start, then the backend does not restart and a WARN says the next start generates it")
    void should_not_restart_when_renewed_at_start_given_a_waiting_request() {
        when(startRequests.requestNewSeedAtStartFor("21fe31df")).thenReturn(ReceiptSeedRequestsAtStart.StartRequest.ALREADY_WAITING);

        renewal.renewAtStart("21fe31df");

        verifyNoInteractions(restarter);
        assertThat(lines.list).singleElement().satisfies(line -> assertThat(line.getLevel()).isEqualTo(Level.WARN));
    }

    @Test
    @DisplayName("Given an earlier start already asked for a new seed for the key, when it is renewed at the start, then the backend does not restart again and an ERROR says the entrypoint kept the seed")
    void should_not_restart_again_when_renewed_at_start_given_an_earlier_start_asked() {
        when(startRequests.requestNewSeedAtStartFor("21fe31df")).thenReturn(ReceiptSeedRequestsAtStart.StartRequest.TRIED_AT_AN_EARLIER_START);

        renewal.renewAtStart("21fe31df");

        verifyNoInteractions(restarter);
        assertThat(lines.list).singleElement().satisfies(line -> {
            assertThat(line.getLevel()).isEqualTo(Level.ERROR);
            assertThat(line.getFormattedMessage()).isEqualTo("The receipt signing key 21fe31df of this server is still withdrawn although an earlier start "
                    + "asked for a new seed, so the backend does not restart again; the entrypoint's log says why it kept the seed");
        });
    }

    @Test
    @DisplayName("Given a start request that could not be written, when the key is renewed at the start, then the backend does not restart")
    void should_not_restart_when_renewed_at_start_given_the_request_could_not_be_written() {
        when(startRequests.requestNewSeedAtStartFor("21fe31df")).thenReturn(ReceiptSeedRequestsAtStart.StartRequest.NOT_WRITTEN);

        renewal.renewAtStart("21fe31df");

        verifyNoInteractions(restarter);
        assertThat(lines.list).isEmpty();
    }

    private static Logger logger() {
        return (Logger) LoggerFactory.getLogger(ReceiptSeedRenewalService.class);
    }
}

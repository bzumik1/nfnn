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
    private final ApplicationRestarter restarter = mock(ApplicationRestarter.class);
    private final ReceiptSeedRenewalService renewal = new ReceiptSeedRenewalService(seeds, restarter);
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
        order.verify(restarter).restartAfterCommit();
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

    private static Logger logger() {
        return (Logger) LoggerFactory.getLogger(ReceiptSeedRenewalService.class);
    }
}

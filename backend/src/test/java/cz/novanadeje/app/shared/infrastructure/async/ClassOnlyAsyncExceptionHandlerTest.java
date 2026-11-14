package cz.novanadeje.app.shared.infrastructure.async;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;

import java.lang.reflect.Method;

import static org.assertj.core.api.Assertions.assertThat;

class ClassOnlyAsyncExceptionHandlerTest {

    private static final String EXCEPTION_TEXT = "nfnn-async-exception-text jana@example.cz";

    private final ListAppender<ILoggingEvent> logged = new ListAppender<>();
    private final Logger logger = (Logger) LoggerFactory.getLogger(ClassOnlyAsyncExceptionHandler.class);

    @BeforeEach
    void capture() {
        logged.start();
        logger.addAppender(logged);
    }

    @AfterEach
    void release() {
        logger.detachAppender(logged);
    }

    @Test
    @DisplayName("Given an async method that threw an exception carrying data in its message, when the exception is handled, then one error names the method and the exception's class and nothing of its message or stack")
    void should_log_only_the_method_and_the_class_when_handled_given_an_exception_carrying_data() throws Exception {
        Method method = Mailer.class.getDeclaredMethod("send", String.class);

        new ClassOnlyAsyncExceptionHandler().handleUncaughtException(new IllegalArgumentException(EXCEPTION_TEXT), method, "jana@example.cz");

        assertThat(logged.list).singleElement().satisfies(event -> {
            assertThat(event.getLevel()).isEqualTo(Level.ERROR);
            assertThat(event.getFormattedMessage()).isEqualTo("Async Mailer.send failed with java.lang.IllegalArgumentException");
            assertThat(event.getThrowableProxy()).isNull();
        });
    }

    @Test
    @DisplayName("Given the async configuration, when its uncaught exception handler is asked for, then it is the one that logs only the method and the class")
    void should_hand_out_the_class_only_handler_when_asked_given_the_async_configuration() {
        assertThat(new AsyncConfiguration().getAsyncUncaughtExceptionHandler()).isInstanceOf(ClassOnlyAsyncExceptionHandler.class);
    }

    static final class Mailer {

        void send(String recipient) {
        }
    }
}

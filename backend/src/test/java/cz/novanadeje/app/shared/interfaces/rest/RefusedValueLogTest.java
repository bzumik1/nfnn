package cz.novanadeje.app.shared.interfaces.rest;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.context.support.ResourceBundleMessageSource;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class RefusedValueLogTest {

    private static final String CLIENT_VALUE = "nfnn-client-value";

    private final ApiExceptionHandler handler = new ApiExceptionHandler();
    private ListAppender<ILoggingEvent> log;

    @BeforeEach
    void setUp() {
        ResourceBundleMessageSource messages = new ResourceBundleMessageSource();
        messages.setBasename("i18n/messages");
        messages.setDefaultEncoding("UTF-8");
        messages.setFallbackToSystemLocale(false);
        handler.setMessageSource(messages);
        log = new ListAppender<>();
        log.start();
        logger().addAppender(log);
    }

    @AfterEach
    void tearDown() {
        logger().detachAppender(log);
    }

    @Test
    @DisplayName("Given a value refused by an IllegalArgumentException, when it is answered, then one warning names the exception's class and where it was thrown, without its message")
    void should_warn_with_class_and_frame_without_message_when_answered_given_illegal_argument() {
        IllegalArgumentException refusal = refusal();
        StackTraceElement frame = refusal.getStackTrace()[0];

        handler.handleIllegalArgument(refusal);

        assertThat(log.list).hasSize(1);
        ILoggingEvent event = log.list.getFirst();
        assertThat(event.getLevel()).isEqualTo(Level.WARN);
        assertThat(event.getFormattedMessage())
                .contains("IllegalArgumentException")
                .contains(RefusedValueLogTest.class.getName() + ".refusal:" + frame.getLineNumber())
                .doesNotContain(CLIENT_VALUE);
        assertThat(event.getThrowableProxy()).isNull();
    }

    @Test
    @DisplayName("Given a value the JDK refuses with an IllegalArgumentException, when it is answered, then the warning also names the site's frame that called it, without the message")
    void should_warn_with_site_frame_when_answered_given_illegal_argument_thrown_by_jdk() {
        IllegalArgumentException refusal = jdkRefusal();

        handler.handleIllegalArgument(refusal);

        assertThat(log.list).hasSize(1);
        assertThat(log.list.getFirst().getFormattedMessage())
                .matches("Refused a value as validation \\(IllegalArgumentException thrown at java\\.util\\.UUID\\.\\w+:\\d+, called from "
                        + RefusedValueLogTest.class.getName().replace(".", "\\.") + "\\.jdkRefusal:\\d+\\)")
                .doesNotContain(CLIENT_VALUE);
    }

    private static IllegalArgumentException jdkRefusal() {
        try {
            UUID.fromString(CLIENT_VALUE);
            throw new IllegalStateException("A UUID was read from " + CLIENT_VALUE);
        } catch (IllegalArgumentException refused) {
            return refused;
        }
    }

    private static IllegalArgumentException refusal() {
        return new IllegalArgumentException("Name is not valid: " + CLIENT_VALUE);
    }

    private static Logger logger() {
        return (Logger) LoggerFactory.getLogger(ApiExceptionHandler.class);
    }
}

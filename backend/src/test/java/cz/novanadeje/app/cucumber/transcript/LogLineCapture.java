package cz.novanadeje.app.cucumber.transcript;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.classic.spi.IThrowableProxy;
import ch.qos.logback.core.AppenderBase;
import org.slf4j.LoggerFactory;

import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

final class LogLineCapture extends AppenderBase<ILoggingEvent> {

    private static final String APPLICATION_LOGGERS = "cz.novanadeje.app";

    private final List<RecordedLogLine> lines = new CopyOnWriteArrayList<>();
    private final Logger logger = (Logger) LoggerFactory.getLogger(APPLICATION_LOGGERS);

    static LogLineCapture attach() {
        LogLineCapture capture = new LogLineCapture();
        capture.setContext(capture.logger.getLoggerContext());
        capture.setName("api-transcript");
        capture.start();
        capture.logger.addAppender(capture);
        return capture;
    }

    void detach() {
        logger.detachAppender(this);
        stop();
    }

    List<RecordedLogLine> lines() {
        return List.copyOf(lines);
    }

    @Override
    protected void append(ILoggingEvent event) {
        IThrowableProxy throwable = event.getThrowableProxy();
        String exception = throwable == null ? "" : throwable.getClassName().substring(throwable.getClassName().lastIndexOf('.') + 1);
        lines.add(new RecordedLogLine(event.getLevel().toString(), event.getLoggerName(), event.getFormattedMessage(), exception));
    }
}

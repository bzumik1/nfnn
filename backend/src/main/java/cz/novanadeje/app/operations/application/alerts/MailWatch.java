package cz.novanadeje.app.operations.application.alerts;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.time.Instant;

@Component
public class MailWatch {

    private static final Logger log = LoggerFactory.getLogger(MailWatch.class);

    private final MailAlertRecorder recorder;

    public MailWatch(MailAlertRecorder recorder) {
        this.recorder = recorder;
    }

    public void failed(Instant at) {
        record(true, at);
    }

    public void succeeded(Instant at) {
        if (open()) {
            record(false, at);
        }
    }

    private boolean open() {
        try {
            return recorder.open();
        } catch (RuntimeException failure) {
            log.warn("The mail alert could not be read: {}", failure.getClass().getSimpleName());
            return false;
        }
    }

    private void record(boolean opened, Instant at) {
        try {
            recorder.record(opened, at);
        } catch (RuntimeException failure) {
            log.warn("The mail alert could not be recorded: {}", failure.getClass().getSimpleName());
        }
    }
}

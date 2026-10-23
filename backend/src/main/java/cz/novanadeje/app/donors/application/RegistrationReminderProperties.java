package cz.novanadeje.app.donors.application;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

@ConfigurationProperties("app.donors.registration-reminder")
public record RegistrationReminderProperties(String cron, Duration delay, Duration window) {

    private static final String PREFIX = "app.donors.registration-reminder.";

    public RegistrationReminderProperties {
        if (cron == null || cron.isBlank()) {
            throw new IllegalArgumentException(PREFIX + "cron must be set, or - to turn the reminder off");
        }
        if (delay == null || delay.isZero() || delay.isNegative()) {
            throw new IllegalArgumentException(PREFIX + "delay must be a positive duration, but is " + delay);
        }
        if (window == null || window.compareTo(delay) <= 0) {
            throw new IllegalArgumentException(PREFIX + "window must be longer than the delay, but is " + window);
        }
    }
}

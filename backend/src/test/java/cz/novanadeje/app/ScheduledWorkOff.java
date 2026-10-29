package cz.novanadeje.app;

import org.springframework.test.context.TestPropertySource;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@Documented
@TestPropertySource(properties = {"app.donations.fio.token=", "app.donations.report.cron=-", "app.contact.retention.cron=-", "app.content.media-cleanup.cron=-",
        "app.operations.backups.check-cron=-", "app.donors.registration-reminder.cron=-"})
public @interface ScheduledWorkOff {
}

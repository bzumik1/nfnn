package cz.novanadeje.app.operations.application.backup;

import cz.novanadeje.app.operations.domain.backup.BackupSchedule;
import cz.novanadeje.app.operations.domain.backup.BackupScheduleRepository;
import cz.novanadeje.app.shared.application.event.AdminActionPerformed;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.DayOfWeek;
import java.time.format.DateTimeFormatter;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@Service
public class BackupScheduleService {

    static final String CHANGE_BACKUP_SCHEDULE_ACTION = "CHANGE_BACKUP_SCHEDULE";

    private static final DateTimeFormatter HOURS_AND_MINUTES = DateTimeFormatter.ofPattern("HH:mm");
    private static final Map<DayOfWeek, String> ON_DAY = Map.of(
            DayOfWeek.MONDAY, "v pondělí",
            DayOfWeek.TUESDAY, "v úterý",
            DayOfWeek.WEDNESDAY, "ve středu",
            DayOfWeek.THURSDAY, "ve čtvrtek",
            DayOfWeek.FRIDAY, "v pátek",
            DayOfWeek.SATURDAY, "v sobotu",
            DayOfWeek.SUNDAY, "v neděli");

    private static final Logger log = LoggerFactory.getLogger(BackupScheduleService.class);

    private final BackupScheduleRepository schedules;
    private final BackupStore store;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    public BackupScheduleService(BackupScheduleRepository schedules, BackupStore store, ApplicationEventPublisher events, Clock clock) {
        this.schedules = schedules;
        this.store = store;
        this.events = events;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public BackupScheduleView view() {
        return new BackupScheduleView(planned(), store.appliedSchedule());
    }

    @Transactional
    public BackupSchedule change(UUID adminId, BackupSchedule schedule) {
        BackupSchedule before = planned();
        schedules.save(schedule);
        store.publishSchedule(schedule);
        events.publishEvent(new AdminActionPerformed(adminId, CHANGE_BACKUP_SCHEDULE_ACTION, Optional.empty(),
                "Plán záloh změněn z „" + describe(before) + "“ na „" + describe(schedule) + "“", clock.instant()));
        log.info("Admin {} changed the backup schedule", adminId);
        return schedule;
    }

    @Transactional(readOnly = true)
    public void publishPlanned() {
        store.publishSchedule(planned());
    }

    private BackupSchedule planned() {
        return schedules.find().orElse(BackupSchedule.DEFAULT);
    }

    private static String describe(BackupSchedule schedule) {
        return "denní záloha " + HOURS_AND_MINUTES.format(schedule.backupTime()) + ", zkušební obnova " + ON_DAY.get(schedule.testRestoreDay()) + " "
                + HOURS_AND_MINUTES.format(schedule.testRestoreTime());
    }
}

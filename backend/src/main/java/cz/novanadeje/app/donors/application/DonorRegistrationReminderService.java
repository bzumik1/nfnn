package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.DonorRepository;
import cz.novanadeje.app.donors.domain.RegistrationReminders;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.List;

@Service
public class DonorRegistrationReminderService {

    private final RegistrationReminders reminders;
    private final DonorRepository donors;
    private final DonorEmailVerificationService emailVerification;
    private final RegistrationReminderProperties properties;
    private final Clock clock;

    public DonorRegistrationReminderService(RegistrationReminders reminders, DonorRepository donors, DonorEmailVerificationService emailVerification,
                                            RegistrationReminderProperties properties, Clock clock) {
        this.reminders = reminders;
        this.donors = donors;
        this.emailVerification = emailVerification;
        this.properties = properties;
        this.clock = clock;
    }

    @Transactional
    public int remindUnconfirmed() {
        Instant now = clock.instant();
        List<DonorId> due = reminders.dueFor(now.minus(properties.window()), now.minus(properties.delay()));
        for (DonorId donorId : due) {
            donors.findById(donorId)
                    .filter(donor -> !donor.isEmailVerified() && !donor.isErased())
                    .ifPresent(emailVerification::issueReminderLink);
            reminders.recordSent(donorId, now);
        }
        return due.size();
    }
}

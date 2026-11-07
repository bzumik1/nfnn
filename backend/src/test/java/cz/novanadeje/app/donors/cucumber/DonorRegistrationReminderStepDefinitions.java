package cz.novanadeje.app.donors.cucumber;

import cz.novanadeje.app.donors.application.DonorRegistrationExpiryService;
import cz.novanadeje.app.donors.application.DonorRegistrationReminderService;
import cz.novanadeje.app.support.AsyncTaskTracker;
import io.cucumber.java.en.When;

public class DonorRegistrationReminderStepDefinitions {

    private final DonorRegistrationExpiryService expiry;
    private final DonorRegistrationReminderService reminders;
    private final AsyncTaskTracker asyncTasks;

    public DonorRegistrationReminderStepDefinitions(DonorRegistrationExpiryService expiry, DonorRegistrationReminderService reminders,
                                                    AsyncTaskTracker asyncTasks) {
        this.expiry = expiry;
        this.reminders = reminders;
        this.asyncTasks = asyncTasks;
    }

    @When("the registration reminder job runs")
    public void theRegistrationReminderJobRuns() {
        expiry.expireUnconfirmed();
        reminders.remindUnconfirmed();
        asyncTasks.awaitIdleAfter("the registration reminder job");
    }
}

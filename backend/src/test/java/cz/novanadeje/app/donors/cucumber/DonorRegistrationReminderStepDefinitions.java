package cz.novanadeje.app.donors.cucumber;

import cz.novanadeje.app.donors.application.DonorRegistrationReminderService;
import cz.novanadeje.app.support.AsyncTaskTracker;
import io.cucumber.java.en.When;

public class DonorRegistrationReminderStepDefinitions {

    private final DonorRegistrationReminderService reminders;
    private final AsyncTaskTracker asyncTasks;

    public DonorRegistrationReminderStepDefinitions(DonorRegistrationReminderService reminders, AsyncTaskTracker asyncTasks) {
        this.reminders = reminders;
        this.asyncTasks = asyncTasks;
    }

    @When("the registration reminder job runs")
    public void theRegistrationReminderJobRuns() {
        reminders.remindUnconfirmed();
        asyncTasks.awaitIdleAfter("the registration reminder job");
    }
}

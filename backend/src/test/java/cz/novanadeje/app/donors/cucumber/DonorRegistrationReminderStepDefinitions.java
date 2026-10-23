package cz.novanadeje.app.donors.cucumber;

import cz.novanadeje.app.donors.application.DonorRegistrationReminderService;
import io.cucumber.java.en.When;

public class DonorRegistrationReminderStepDefinitions {

    private final DonorRegistrationReminderService reminders;

    public DonorRegistrationReminderStepDefinitions(DonorRegistrationReminderService reminders) {
        this.reminders = reminders;
    }

    @When("the registration reminder job runs")
    public void theRegistrationReminderJobRuns() {
        reminders.remindUnconfirmed();
    }
}

package cz.novanadeje.app.donations.cucumber;

import cz.novanadeje.app.donations.application.receipt.YearlyReceiptAnnouncementService;
import cz.novanadeje.app.support.AsyncTaskTracker;
import io.cucumber.java.en.When;

public class YearlyReceiptAnnouncementStepDefinitions {

    private final YearlyReceiptAnnouncementService announcements;
    private final AsyncTaskTracker asyncTasks;

    public YearlyReceiptAnnouncementStepDefinitions(YearlyReceiptAnnouncementService announcements, AsyncTaskTracker asyncTasks) {
        this.announcements = announcements;
        this.asyncTasks = asyncTasks;
    }

    @When("the yearly receipt announcement runs")
    public void theYearlyReceiptAnnouncementRuns() {
        announcements.announceDue();
        asyncTasks.awaitIdleAfter("the yearly receipt announcement");
    }
}

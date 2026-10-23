package cz.novanadeje.app.donations.domain.report;

import cz.novanadeje.app.shared.domain.EmailAddress;

import java.time.LocalDate;

public record ReportSettings(ReportRecipients recipients, int sendDay, ReportSections sections) {

    public static final int FIRST_SEND_DAY = 1;
    public static final int LAST_SEND_DAY = 28;

    public ReportSettings {
        if (recipients == null || sections == null) {
            throw new IllegalArgumentException("Report settings name the recipients and the sections");
        }
        if (sendDay < FIRST_SEND_DAY || sendDay > LAST_SEND_DAY) {
            throw new IllegalArgumentException("The report is sent on a day between " + FIRST_SEND_DAY + " and " + LAST_SEND_DAY
                    + " of the month, not " + sendDay);
        }
    }

    public static ReportSettings defaults(EmailAddress recipient) {
        return new ReportSettings(ReportRecipients.of(recipient), FIRST_SEND_DAY, ReportSections.all());
    }

    public boolean dueOn(LocalDate today) {
        if (today == null) {
            throw new IllegalArgumentException("Today is required");
        }
        return today.getDayOfMonth() >= sendDay;
    }

    public LocalDate sendDateFor(ReportMonth month) {
        if (month == null) {
            throw new IllegalArgumentException("Report month is required");
        }
        return month.value().plusMonths(1).atDay(sendDay);
    }
}

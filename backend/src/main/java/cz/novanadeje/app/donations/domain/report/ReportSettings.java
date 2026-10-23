package cz.novanadeje.app.donations.domain.report;

import cz.novanadeje.app.shared.domain.EmailAddress;

import java.time.LocalDate;
import java.time.LocalDateTime;

public record ReportSettings(ReportRecipients recipients, int sendDay, int sendHour, ReportSections sections) {

    public static final int FIRST_SEND_DAY = 1;
    public static final int LAST_SEND_DAY = 28;
    public static final int FIRST_SEND_HOUR = 0;
    public static final int LAST_SEND_HOUR = 23;
    public static final int DEFAULT_SEND_HOUR = 7;

    public ReportSettings {
        if (recipients == null || sections == null) {
            throw new IllegalArgumentException("Report settings name the recipients and the sections");
        }
        if (sendDay < FIRST_SEND_DAY || sendDay > LAST_SEND_DAY) {
            throw new IllegalArgumentException("The report is sent on a day between " + FIRST_SEND_DAY + " and " + LAST_SEND_DAY
                    + " of the month, not " + sendDay);
        }
        if (sendHour < FIRST_SEND_HOUR || sendHour > LAST_SEND_HOUR) {
            throw new IllegalArgumentException("The report is sent at an hour between " + FIRST_SEND_HOUR + " and " + LAST_SEND_HOUR
                    + ", not " + sendHour);
        }
    }

    public static ReportSettings defaults(EmailAddress recipient) {
        return new ReportSettings(ReportRecipients.of(recipient), FIRST_SEND_DAY, DEFAULT_SEND_HOUR, ReportSections.all());
    }

    public boolean dueAt(LocalDateTime foundationTime) {
        if (foundationTime == null) {
            throw new IllegalArgumentException("The foundation's time is required");
        }
        int day = foundationTime.getDayOfMonth();
        return day > sendDay || day == sendDay && foundationTime.getHour() >= sendHour;
    }

    public LocalDate sendDateFor(ReportMonth month) {
        if (month == null) {
            throw new IllegalArgumentException("Report month is required");
        }
        return month.value().plusMonths(1).atDay(sendDay);
    }
}

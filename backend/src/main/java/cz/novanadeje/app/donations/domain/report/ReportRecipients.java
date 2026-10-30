package cz.novanadeje.app.donations.domain.report;

import cz.novanadeje.app.shared.domain.EmailAddress;

import java.util.List;

public record ReportRecipients(List<EmailAddress> addresses) {

    public static final int MAX_RECIPIENTS = 10;

    public ReportRecipients {
        if (addresses == null || addresses.isEmpty()) {
            throw new IllegalArgumentException("The report needs at least one recipient");
        }
        if (addresses.size() > MAX_RECIPIENTS) {
            throw new IllegalArgumentException("The report has at most " + MAX_RECIPIENTS + " recipients, not " + addresses.size());
        }
        if (addresses.stream().distinct().count() != addresses.size()) {
            throw new RepeatedReportRecipient();
        }
        addresses = List.copyOf(addresses);
    }

    public static ReportRecipients of(EmailAddress... addresses) {
        return new ReportRecipients(List.of(addresses));
    }

    public static ReportRecipients parse(List<String> values) {
        if (values == null) {
            throw new IllegalArgumentException("The report needs at least one recipient");
        }
        if (!values.stream().allMatch(EmailAddress::isValid)) {
            throw new InvalidReportRecipient();
        }
        return new ReportRecipients(values.stream().map(EmailAddress::new).toList());
    }

    public List<String> values() {
        return addresses.stream().map(EmailAddress::value).toList();
    }

    public int count() {
        return addresses.size();
    }
}

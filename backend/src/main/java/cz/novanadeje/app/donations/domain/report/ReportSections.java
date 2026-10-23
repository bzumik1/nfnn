package cz.novanadeje.app.donations.domain.report;

import java.util.ArrayList;
import java.util.List;

public record ReportSections(boolean donors, boolean donations, boolean unpairedPayments, boolean bankImport) {

    public ReportSections {
        if (!donors && !donations && !unpairedPayments && !bankImport) {
            throw new IllegalArgumentException("The report has at least one section");
        }
    }

    public static ReportSections all() {
        return new ReportSections(true, true, true, true);
    }

    public List<String> names() {
        List<String> names = new ArrayList<>();
        if (donors) {
            names.add("donors");
        }
        if (donations) {
            names.add("donations");
        }
        if (unpairedPayments) {
            names.add("unpaired payments");
        }
        if (bankImport) {
            names.add("bank import");
        }
        return List.copyOf(names);
    }
}

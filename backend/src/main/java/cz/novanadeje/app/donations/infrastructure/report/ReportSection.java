package cz.novanadeje.app.donations.infrastructure.report;

import java.util.List;

public record ReportSection(String heading, List<String> lines) {

    public ReportSection {
        lines = List.copyOf(lines);
    }
}

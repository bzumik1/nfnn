package cz.novanadeje.app.donations.infrastructure.report;

import cz.novanadeje.app.donations.domain.report.ReportMonth;
import cz.novanadeje.app.shared.domain.Money;
import cz.novanadeje.app.sharedcases.SharedCase;
import cz.novanadeje.app.sharedcases.SharedCaseRunner;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.JsonNodeFactory;
import tools.jackson.databind.node.ObjectNode;

import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;

class MonthlyReportFormattingSharedCasesTest extends SharedCaseRunner {

    @Override
    protected String caseFile() {
        return "monthly-report/formatting.json";
    }

    @Override
    protected String when() {
        return "when the backend formats it for the monthly report e-mail";
    }

    @Override
    protected String then() {
        return "then the e-mail prints the expected text";
    }

    @Override
    protected void run(SharedCase sharedCase) {
        assertGives(formatted(sharedCase.input()), sharedCase.expected());
    }

    private static ObjectNode formatted(JsonNode input) {
        String format = input.get("format").asString();
        String text = switch (format) {
            case "amount" -> MonthlyReportFormats.amount(Money.czk(input.get("amountMinor").asLong()));
            case "count" -> MonthlyReportFormats.count(input.get("count").asLong());
            case "month" -> MonthlyReportFormats.month(new ReportMonth(YearMonth.parse(input.get("month").asString())));
            case "date" -> MonthlyReportFormats.date(LocalDate.parse(input.get("date").asString()));
            case "time" -> MonthlyReportFormats.time(Instant.parse(input.get("instant").asString()));
            default -> throw new AssertionError("No monthly report formatter is named " + format);
        };
        return JsonNodeFactory.instance.objectNode().put("text", text);
    }
}

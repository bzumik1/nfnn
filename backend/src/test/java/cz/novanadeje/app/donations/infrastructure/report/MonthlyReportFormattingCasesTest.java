package cz.novanadeje.app.donations.infrastructure.report;

import cz.novanadeje.app.donations.domain.report.ReportMonth;
import cz.novanadeje.app.cucumber.transcript.ApiTranscripts;
import cz.novanadeje.app.regression.GoldenFiles;
import cz.novanadeje.app.shared.domain.Money;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.JsonNodeFactory;
import tools.jackson.databind.node.ObjectNode;

import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class MonthlyReportFormattingCasesTest {

    static final String CASES = "shared-cases/monthly-report/formatting.json";
    private static final JsonNodeFactory NODES = JsonNodeFactory.instance;
    private static final List<Long> AMOUNTS = List.of(0L, 1L, 50L, 100L, 50000L, 100050L, 99999999L, 100000000L, 1234567890L);
    private static final List<Long> COUNTS = List.of(0L, 1L, 999L, 1000L, 1234567L);
    private static final List<String> MONTHS = List.of("2026-01", "2026-02", "2026-03", "2026-05", "2026-07", "2026-11", "2026-12");
    private static final List<String> DATES = List.of("2026-01-01", "2026-02-28", "2026-10-05", "2026-12-31", "2028-02-29");
    private static final List<String> TIMES = List.of("2026-01-15T09:05:00Z", "2026-03-29T00:59:00Z", "2026-03-29T01:00:00Z", "2026-07-31T22:30:00Z",
            "2026-10-25T00:59:00Z", "2026-10-25T01:00:00Z", "2026-12-31T22:59:00Z", "2026-12-31T23:00:00Z");

    @Test
    @DisplayName("Given the monthly report formatting cases, when v2 formats them for the e-mail, then the texts equal the recorded shared cases")
    void should_equal_the_recorded_shared_cases_when_v2_formats_the_monthly_report_cases() {
        GoldenFiles.generateSharedCases(CASES, cases());
    }

    @Test
    @DisplayName("Given the monthly report formatting cases, when they are generated twice, then both runs give identical files")
    void should_give_identical_files_when_the_monthly_report_formatting_cases_are_generated_twice() {
        assertThat(GoldenFiles.canonical(cases())).isEqualTo(GoldenFiles.canonical(cases()));
    }

    @Test
    @DisplayName("Given a bank time in summer, when v2 formats it for the e-mail, then it is Prague time")
    void should_be_prague_time_when_v2_formats_a_bank_time_in_summer() {
        assertThat(MonthlyReportFormats.time(Instant.parse("2026-07-31T22:30:00Z"))).isEqualTo("1. 8. 2026 0:30");
    }

    private static ObjectNode cases() {
        ArrayNode cases = NODES.arrayNode();
        for (long amount : AMOUNTS) {
            cases.add(entry(hellers(amount), input("amount").put("amountMinor", amount), MonthlyReportFormats.amount(Money.czk(amount))));
        }
        for (long count : COUNTS) {
            cases.add(entry("a count of " + count, input("count").put("count", count), MonthlyReportFormats.count(count)));
        }
        for (String month : MONTHS) {
            cases.add(entry("the month " + month, input("month").put("month", month), MonthlyReportFormats.month(new ReportMonth(YearMonth.parse(month)))));
        }
        for (String date : DATES) {
            cases.add(entry("the date " + date, input("date").put("date", date), MonthlyReportFormats.date(LocalDate.parse(date))));
        }
        for (String time : TIMES) {
            cases.add(entry("the bank time " + time, input("time").put("instant", time), MonthlyReportFormats.time(Instant.parse(time))));
        }
        ObjectNode file = NODES.objectNode();
        file.put("source", ApiTranscripts.SOURCE);
        file.put("logic", "How the monthly report e-mail prints its figures (MonthlyReportFormats): amounts in hellers always with two decimals, "
                + "U+00A0 as the thousands separator and before Kč; counts with U+00A0 between thousands; months as the Czech nominative month name "
                + "and year; dates d. M. yyyy; bank times as d. M. yyyy H:mm in Prague time. input.format names the formatter, expected.text is the printed text");
        file.set("cases", cases);
        return file;
    }

    private static String hellers(long amount) {
        return amount == 1 ? "1 heller" : amount + " hellers";
    }

    private static ObjectNode input(String format) {
        return NODES.objectNode().put("format", format);
    }

    private static ObjectNode entry(String name, ObjectNode input, String text) {
        ObjectNode entry = NODES.objectNode();
        entry.put("name", name);
        entry.set("input", input);
        entry.putObject("expected").put("text", text);
        return entry;
    }
}

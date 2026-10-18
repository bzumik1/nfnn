package cz.novanadeje.app.donations.infrastructure.report;

import cz.novanadeje.app.donations.domain.FoundationCalendar;
import cz.novanadeje.app.donations.domain.report.ReportMonth;
import cz.novanadeje.app.shared.domain.Currency;
import cz.novanadeje.app.shared.domain.Money;

import java.text.DecimalFormat;
import java.text.DecimalFormatSymbols;
import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.Locale;

final class MonthlyReportFormats {

    static final Locale CZECH = Locale.forLanguageTag("cs");

    private static final char NO_BREAK_SPACE = ' ';
    private static final DateTimeFormatter MONTH = DateTimeFormatter.ofPattern("LLLL yyyy", CZECH);
    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("d. M. yyyy", CZECH);
    private static final DateTimeFormatter TIME = DateTimeFormatter.ofPattern("d. M. yyyy H:mm", CZECH).withZone(FoundationCalendar.ZONE);

    private MonthlyReportFormats() {
    }

    static String amount(Money amount) {
        return decimal("#,##0.00").format(amount.toDecimal()) + NO_BREAK_SPACE + symbol(amount.currency());
    }

    static String count(long count) {
        return decimal("#,##0").format(count);
    }

    static String month(ReportMonth month) {
        return MONTH.format(month.value());
    }

    static String date(LocalDate date) {
        return DATE.format(date);
    }

    static String time(Instant instant) {
        return TIME.format(instant);
    }

    private static DecimalFormat decimal(String pattern) {
        DecimalFormatSymbols symbols = DecimalFormatSymbols.getInstance(Locale.ROOT);
        symbols.setGroupingSeparator(NO_BREAK_SPACE);
        symbols.setDecimalSeparator(',');
        return new DecimalFormat(pattern, symbols);
    }

    private static String symbol(Currency currency) {
        return switch (currency) {
            case CZK -> "Kč";
        };
    }
}

package cz.novanadeje.app.donations.infrastructure.pdf;

import cz.novanadeje.app.shared.domain.Currency;
import cz.novanadeje.app.shared.domain.Money;

import java.text.DecimalFormat;
import java.text.DecimalFormatSymbols;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.Locale;

final class ReceiptFormats {

    private static final char NO_BREAK_SPACE = ' ';
    private static final DateTimeFormatter CZECH_DATE = DateTimeFormatter.ofPattern("d. M. yyyy", Locale.forLanguageTag("cs"));
    private static final DateTimeFormatter ENGLISH_DATE = DateTimeFormatter.ofPattern("d MMMM yyyy", Locale.ENGLISH);

    private ReceiptFormats() {
    }

    static String czechAmount(Money amount) {
        return number(amount, NO_BREAK_SPACE, ',') + NO_BREAK_SPACE + czechSymbol(amount.currency());
    }

    static String englishAmount(Money amount) {
        return amount.currency().name() + " " + number(amount, ',', '.');
    }

    static String czechDate(LocalDate date) {
        return CZECH_DATE.format(date);
    }

    static String englishDate(LocalDate date) {
        return ENGLISH_DATE.format(date);
    }

    private static String number(Money amount, char groupingSeparator, char decimalSeparator) {
        DecimalFormatSymbols symbols = DecimalFormatSymbols.getInstance(Locale.ROOT);
        symbols.setGroupingSeparator(groupingSeparator);
        symbols.setDecimalSeparator(decimalSeparator);
        DecimalFormat format = new DecimalFormat("#,##0", symbols);
        int fractionDigits = amount.amountMinor() % 100 == 0 ? 0 : 2;
        format.setMinimumFractionDigits(fractionDigits);
        format.setMaximumFractionDigits(fractionDigits);
        return format.format(amount.toDecimal());
    }

    private static String czechSymbol(Currency currency) {
        return switch (currency) {
            case CZK -> "Kč";
        };
    }
}

package cz.novanadeje.app.operations.domain.release;

import java.time.YearMonth;
import java.util.Comparator;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public record Release(YearMonth month, int order) {

    public static final int FIRST_YEAR = 2026;
    public static final int MAX_LENGTH = 12;

    private static final int LAST_YEAR = 9999;
    private static final int MAX_ORDER = 9999;
    private static final Pattern SHAPE = Pattern.compile("(\\d{4})\\.(1[0-2]|[1-9])\\.([1-9]\\d{0,3})");
    private static final Comparator<Release> AGE = Comparator.comparing(Release::month).thenComparingInt(Release::order);

    public Release {
        if (month == null || month.getYear() < FIRST_YEAR || month.getYear() > LAST_YEAR) {
            throw new IllegalArgumentException("A release is of a month from " + FIRST_YEAR + " on");
        }
        if (order < 1 || order > MAX_ORDER) {
            throw new IllegalArgumentException("A release's order in its month is from 1 to " + MAX_ORDER);
        }
    }

    public static Optional<Release> parse(String text) {
        if (text == null || text.length() > MAX_LENGTH) {
            return Optional.empty();
        }
        Matcher matcher = SHAPE.matcher(text);
        if (!matcher.matches()) {
            return Optional.empty();
        }
        int year = Integer.parseInt(matcher.group(1));
        if (year < FIRST_YEAR) {
            return Optional.empty();
        }
        return Optional.of(new Release(YearMonth.of(year, Integer.parseInt(matcher.group(2))), Integer.parseInt(matcher.group(3))));
    }

    public boolean isNewerThan(Release other) {
        return AGE.compare(this, other) > 0;
    }

    @Override
    public String toString() {
        return month.getYear() + "." + month.getMonthValue() + "." + order;
    }
}

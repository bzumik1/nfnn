package cz.novanadeje.app.operations.infrastructure.backup;

import cz.novanadeje.app.shared.domain.FoundationZone;
import java.text.DecimalFormat;
import java.text.DecimalFormatSymbols;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Locale;

final class BackupFormats {

    static final ZoneId ZONE = FoundationZone.ZONE;
    static final Locale CZECH = Locale.forLanguageTag("cs");

    private static final DateTimeFormatter TIME = DateTimeFormatter.ofPattern("d. M. yyyy H:mm", CZECH).withZone(ZONE);
    private static final char NO_BREAK_SPACE = ' ';

    private BackupFormats() {
    }

    static String time(Instant instant) {
        return TIME.format(instant);
    }

    static String size(long bytes) {
        DecimalFormatSymbols symbols = DecimalFormatSymbols.getInstance(CZECH);
        symbols.setGroupingSeparator(NO_BREAK_SPACE);
        if (bytes >= 1_048_576) {
            return new DecimalFormat("#,##0.0", symbols).format(bytes / 1_048_576.0) + NO_BREAK_SPACE + "MB";
        }
        return new DecimalFormat("#,##0", symbols).format(Math.ceilDiv(bytes, 1024)) + NO_BREAK_SPACE + "kB";
    }
}

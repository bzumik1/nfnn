package cz.novanadeje.app.shared.domain;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

public record PrintableText(String text, List<Integer> outside) {

    private static final int[][] PRINTABLE = {
            {0x0020, 0x007E}, {0x00A0, 0x00AC}, {0x00AE, 0x0148}, {0x014A, 0x01C3}, {0x01C5, 0x024F}, {0x0259, 0x0259},
            {0x02BB, 0x02BC}, {0x02C6, 0x02C7}, {0x02DA, 0x02DA}, {0x02DC, 0x02DD}, {0x0375, 0x0376}, {0x037A, 0x037F},
            {0x0384, 0x038A}, {0x038C, 0x038C}, {0x038E, 0x03A1}, {0x03A3, 0x03D7}, {0x03DC, 0x03DD}, {0x03F0, 0x03F6},
            {0x03F9, 0x03FA}, {0x03FC, 0x0479}, {0x0480, 0x0482}, {0x048A, 0x049D}, {0x04A0, 0x04FF}, {0x1E00, 0x1E9B},
            {0x1E9D, 0x1EFB}, {0x2013, 0x2014}, {0x2018, 0x201A}, {0x201C, 0x201E}, {0x2020, 0x2020}, {0x2022, 0x2022},
            {0x2026, 0x2026}, {0x2032, 0x2033}, {0x2039, 0x203A}, {0x20AC, 0x20AC}, {0x2116, 0x2116}, {0x2122, 0x2122},
            {0x2212, 0x2212}
    };
    private static final int[][] DROPPED = {
            {0x00AD, 0x00AD}, {0x061C, 0x061C}, {0x180E, 0x180E}, {0x200B, 0x200F}, {0x202A, 0x202E}, {0x2060, 0x2064},
            {0x2066, 0x206F}, {0xFEFF, 0xFEFF}
    };

    public PrintableText {
        if (text == null || outside == null) {
            throw new IllegalArgumentException("A printable text needs its text and the code points outside the printable set");
        }
        outside = List.copyOf(outside);
    }

    public static PrintableText of(String raw) {
        StringBuilder kept = new StringBuilder(raw.length());
        raw.codePoints().filter(codePoint -> !within(DROPPED, codePoint)).forEach(kept::appendCodePoint);
        String printed = Normalizer.normalize(kept, Normalizer.Form.NFC);
        Set<Integer> outside = new LinkedHashSet<>();
        printed.codePoints().filter(codePoint -> !within(PRINTABLE, codePoint)).forEach(outside::add);
        return new PrintableText(printed, new ArrayList<>(outside));
    }

    public static boolean prints(String raw) {
        return of(raw).prints();
    }

    public boolean prints() {
        return outside.isEmpty();
    }

    private static boolean within(int[][] ranges, int codePoint) {
        for (int[] range : ranges) {
            if (codePoint >= range[0] && codePoint <= range[1]) {
                return true;
            }
        }
        return false;
    }
}

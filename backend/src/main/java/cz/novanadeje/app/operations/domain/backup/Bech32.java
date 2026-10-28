package cz.novanadeje.app.operations.domain.backup;

import java.util.Locale;

final class Bech32 {

    private static final String CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
    private static final int[] GENERATOR = {0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3};
    private static final int CHECKSUM_LENGTH = 6;
    private static final char SEPARATOR = '1';

    private Bech32() {
    }

    static boolean holds(String text, String humanReadablePart, int byteCount) {
        String lower = text.toLowerCase(Locale.ROOT);
        int separator = lower.lastIndexOf(SEPARATOR);
        if (separator < 1 || !lower.substring(0, separator).equals(humanReadablePart)) {
            return false;
        }
        String encoded = lower.substring(separator + 1);
        if (encoded.length() < CHECKSUM_LENGTH) {
            return false;
        }
        int[] values = new int[encoded.length()];
        for (int i = 0; i < encoded.length(); i++) {
            values[i] = CHARSET.indexOf(encoded.charAt(i));
            if (values[i] < 0) {
                return false;
            }
        }
        return checksumHolds(humanReadablePart, values) && carriesBytes(values, values.length - CHECKSUM_LENGTH, byteCount);
    }

    private static boolean checksumHolds(String humanReadablePart, int[] values) {
        int checksum = 1;
        for (int i = 0; i < humanReadablePart.length(); i++) {
            checksum = step(checksum, humanReadablePart.charAt(i) >> 5);
        }
        checksum = step(checksum, 0);
        for (int i = 0; i < humanReadablePart.length(); i++) {
            checksum = step(checksum, humanReadablePart.charAt(i) & 31);
        }
        for (int value : values) {
            checksum = step(checksum, value);
        }
        return checksum == 1;
    }

    private static int step(int checksum, int value) {
        int top = checksum >>> 25;
        int next = ((checksum & 0x1ffffff) << 5) ^ value;
        for (int i = 0; i < GENERATOR.length; i++) {
            if (((top >>> i) & 1) == 1) {
                next ^= GENERATOR[i];
            }
        }
        return next;
    }

    private static boolean carriesBytes(int[] values, int dataLength, int byteCount) {
        int bits = dataLength * 5;
        if (bits / 8 != byteCount || bits % 8 >= 5) {
            return false;
        }
        int padding = bits % 8;
        return padding == 0 || (values[dataLength - 1] & ((1 << padding) - 1)) == 0;
    }
}

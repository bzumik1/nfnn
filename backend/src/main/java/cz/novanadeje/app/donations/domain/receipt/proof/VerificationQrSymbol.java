package cz.novanadeje.app.donations.domain.receipt.proof;

import java.nio.charset.StandardCharsets;
import java.util.Optional;

public record VerificationQrSymbol(int version, ErrorCorrection errorCorrection) {

    public static final int LAST_VERSION_AT_MEDIUM = 13;
    public static final int MAX_VERSION = 40;
    public static final int MAX_PROOF_BYTES = 2893;
    private static final int[] MEDIUM_DATA_CODEWORDS = {16, 28, 44, 64, 86, 108, 124, 154, 182, 216, 254, 290, 334, 365, 415, 453, 507, 563,
            627, 669, 714, 782, 860, 914, 1000, 1062, 1128, 1193, 1267, 1373, 1455, 1541, 1631, 1725, 1812, 1914, 1992, 2102, 2216, 2334};
    private static final int[] LOW_DATA_CODEWORDS = {19, 34, 55, 80, 108, 136, 156, 194, 232, 274, 324, 370, 428, 461, 523, 589, 647, 721,
            795, 861, 932, 1006, 1094, 1174, 1276, 1370, 1468, 1531, 1631, 1735, 1843, 1955, 2071, 2191, 2306, 2434, 2566, 2702, 2812, 2956};
    private static final int MODE_BITS = 4;
    private static final int DIGIT_GROUP = 3;
    private static final int[] DIGIT_REMAINDER_BITS = {0, 4, 7};
    private static final int BITS_PER_DIGIT_GROUP = 10;

    public enum ErrorCorrection {
        L,
        M
    }

    public VerificationQrSymbol {
        if (version < 1 || version > MAX_VERSION || errorCorrection == null) {
            throw new IllegalArgumentException("A QR symbol has a version from 1 to 40 and an error correction level");
        }
    }

    public static Optional<VerificationQrSymbol> of(String proofText) {
        if (!proofText.startsWith(ReceiptProofText.ADDRESS)) {
            throw new IllegalArgumentException("A verification QR carries a proof text");
        }
        int addressBytes = ReceiptProofText.ADDRESS.getBytes(StandardCharsets.US_ASCII).length;
        int digits = proofText.length() - ReceiptProofText.ADDRESS.length();
        for (int version = 1; version <= MAX_VERSION; version++) {
            ErrorCorrection level = version <= LAST_VERSION_AT_MEDIUM ? ErrorCorrection.M : ErrorCorrection.L;
            if (bits(version, addressBytes, digits) <= Byte.SIZE * dataCodewords(version, level)) {
                return Optional.of(new VerificationQrSymbol(version, level));
            }
        }
        return Optional.empty();
    }

    static int dataCodewords(int version, ErrorCorrection level) {
        return (level == ErrorCorrection.M ? MEDIUM_DATA_CODEWORDS : LOW_DATA_CODEWORDS)[version - 1];
    }

    private static int bits(int version, int bytes, int digits) {
        int byteSegment = MODE_BITS + byteCountBits(version) + Byte.SIZE * bytes;
        int numericSegment = MODE_BITS + digitCountBits(version) + BITS_PER_DIGIT_GROUP * (digits / DIGIT_GROUP)
                + DIGIT_REMAINDER_BITS[digits % DIGIT_GROUP];
        return byteSegment + numericSegment;
    }

    private static int byteCountBits(int version) {
        return version <= 9 ? 8 : 16;
    }

    private static int digitCountBits(int version) {
        if (version <= 9) {
            return 10;
        }
        return version <= 26 ? 12 : 14;
    }
}

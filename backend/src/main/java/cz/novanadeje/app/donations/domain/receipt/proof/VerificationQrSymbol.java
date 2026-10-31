package cz.novanadeje.app.donations.domain.receipt.proof;

import java.nio.charset.StandardCharsets;
import java.util.Optional;

public record VerificationQrSymbol(int version, ErrorCorrection errorCorrection) {

    public static final int MAX_VERSION = 40;
    public static final int MAX_PROOF_BYTES = 2893;
    private static final int[] HIGH_DATA_CODEWORDS = {9, 16, 26, 36, 46, 60, 66, 86, 100, 122, 140, 158, 180, 197, 223, 253, 283, 313, 341, 385,
            406, 442, 464, 514, 538, 596, 628, 661, 701, 745, 793, 845, 901, 961, 986, 1054, 1096, 1142, 1222, 1276};
    private static final int[] LOW_DATA_CODEWORDS = {19, 34, 55, 80, 108, 136, 156, 194, 232, 274, 324, 370, 428, 461, 523, 589, 647, 721,
            795, 861, 932, 1006, 1094, 1174, 1276, 1370, 1468, 1531, 1631, 1735, 1843, 1955, 2071, 2191, 2306, 2434, 2566, 2702, 2812, 2956};
    private static final int MODE_BITS = 4;
    private static final int DIGIT_GROUP = 3;
    private static final int[] DIGIT_REMAINDER_BITS = {0, 4, 7};
    private static final int BITS_PER_DIGIT_GROUP = 10;

    public enum ErrorCorrection {
        L,
        H
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
        return smallest(ErrorCorrection.H, addressBytes, digits).or(() -> smallest(ErrorCorrection.L, addressBytes, digits));
    }

    private static Optional<VerificationQrSymbol> smallest(ErrorCorrection level, int addressBytes, int digits) {
        for (int version = 1; version <= MAX_VERSION; version++) {
            if (bits(version, addressBytes, digits) <= Byte.SIZE * dataCodewords(version, level)) {
                return Optional.of(new VerificationQrSymbol(version, level));
            }
        }
        return Optional.empty();
    }

    static int dataCodewords(int version, ErrorCorrection level) {
        return (level == ErrorCorrection.H ? HIGH_DATA_CODEWORDS : LOW_DATA_CODEWORDS)[version - 1];
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

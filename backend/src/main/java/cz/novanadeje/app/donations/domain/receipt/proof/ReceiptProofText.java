package cz.novanadeje.app.donations.domain.receipt.proof;

import java.io.ByteArrayOutputStream;
import java.math.BigInteger;
import java.util.regex.Pattern;

public final class ReceiptProofText {

    public static final String ADDRESS = "https://nfnn.cz/overit#";
    public static final String TEXT_VERSION = "1";
    public static final String PREFIX = ADDRESS + TEXT_VERSION;
    private static final int CHUNK_BYTES = 7;
    private static final int[] CHUNK_DIGITS = {0, 3, 5, 8, 10, 13, 15, 17};
    private static final Pattern DIGITS = Pattern.compile("[0-9]+");

    private ReceiptProofText() {
    }

    public static String of(byte[] bytes) {
        StringBuilder text = new StringBuilder(PREFIX);
        for (int at = 0; at < bytes.length; at += CHUNK_BYTES) {
            int length = Math.min(CHUNK_BYTES, bytes.length - at);
            byte[] chunk = new byte[length];
            System.arraycopy(bytes, at, chunk, 0, length);
            String digits = new BigInteger(1, chunk).toString();
            text.append("0".repeat(CHUNK_DIGITS[length] - digits.length())).append(digits);
        }
        return text.toString();
    }

    public static byte[] read(String text) {
        if (text == null || !text.startsWith(PREFIX)) {
            throw new InvalidReceiptProof(ReceiptProofRejection.NOT_A_PROOF);
        }
        String digits = text.substring(PREFIX.length());
        int lastChunkBytes = lastChunkBytes(digits.length() % CHUNK_DIGITS[CHUNK_BYTES]);
        if (!DIGITS.matcher(digits).matches() || lastChunkBytes < 0) {
            throw new InvalidReceiptProof(ReceiptProofRejection.DIGITS);
        }
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        int fullChunks = digits.length() / CHUNK_DIGITS[CHUNK_BYTES];
        for (int chunk = 0; chunk < fullChunks; chunk++) {
            int from = chunk * CHUNK_DIGITS[CHUNK_BYTES];
            bytes.writeBytes(chunk(digits.substring(from, from + CHUNK_DIGITS[CHUNK_BYTES]), CHUNK_BYTES));
        }
        if (lastChunkBytes > 0) {
            bytes.writeBytes(chunk(digits.substring(fullChunks * CHUNK_DIGITS[CHUNK_BYTES]), lastChunkBytes));
        }
        return bytes.toByteArray();
    }

    private static int lastChunkBytes(int digits) {
        for (int bytes = 0; bytes < CHUNK_BYTES; bytes++) {
            if (CHUNK_DIGITS[bytes] == digits) {
                return bytes;
            }
        }
        return -1;
    }

    private static byte[] chunk(String digits, int length) {
        BigInteger value = new BigInteger(digits);
        if (value.bitLength() > Byte.SIZE * length) {
            throw new InvalidReceiptProof(ReceiptProofRejection.DIGITS);
        }
        byte[] signed = value.toByteArray();
        byte[] chunk = new byte[length];
        int copied = Math.min(length, signed.length);
        System.arraycopy(signed, signed.length - copied, chunk, length - copied, copied);
        return chunk;
    }
}

package cz.novanadeje.app.donations.domain.receipt.proof;

import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.text.Normalizer;

final class ProofBytesReader {

    static final long MAX_VARINT = 1L << 53;
    private static final int MAX_VARINT_GROUPS = 8;

    private final byte[] bytes;
    private int at;

    ProofBytesReader(byte[] bytes, int at) {
        this.bytes = bytes;
        this.at = at;
    }

    int u8() {
        if (at >= bytes.length) {
            throw new InvalidReceiptProof(ReceiptProofRejection.TRUNCATED);
        }
        return bytes[at++] & 0xff;
    }

    int u16() {
        return u8() << 8 | u8();
    }

    int u24() {
        return u8() << 16 | u16();
    }

    long u32() {
        return (long) u8() << 24 | u24();
    }

    long varint() {
        long value = 0;
        for (int group = 0; ; group++) {
            if (group == MAX_VARINT_GROUPS) {
                throw new InvalidReceiptProof(ReceiptProofRejection.INVALID_VALUE);
            }
            int next = u8();
            value |= (long) (next & 0x7f) << (7 * group);
            if ((next & 0x80) == 0) {
                if (group > 0 && next == 0) {
                    throw new InvalidReceiptProof(ReceiptProofRejection.NON_MINIMAL_VARINT);
                }
                break;
            }
        }
        if (value >= MAX_VARINT) {
            throw new InvalidReceiptProof(ReceiptProofRejection.INVALID_VALUE);
        }
        return value;
    }

    String text() {
        long length = varint();
        if (length > bytes.length - at) {
            throw new InvalidReceiptProof(ReceiptProofRejection.TRUNCATED);
        }
        String text;
        try {
            text = StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT)
                    .decode(ByteBuffer.wrap(bytes, at, (int) length)).toString();
        } catch (CharacterCodingException notUtf8) {
            throw new InvalidReceiptProof(ReceiptProofRejection.INVALID_TEXT);
        }
        at += (int) length;
        if (text.isEmpty() || !Normalizer.isNormalized(text, Normalizer.Form.NFC)) {
            throw new InvalidReceiptProof(ReceiptProofRejection.INVALID_TEXT);
        }
        return text;
    }

    boolean atEnd() {
        return at == bytes.length;
    }
}

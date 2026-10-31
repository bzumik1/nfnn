package cz.novanadeje.app.donations.domain.receipt.proof;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;

final class ProofBytesWriter {

    private final ByteArrayOutputStream bytes = new ByteArrayOutputStream();

    ProofBytesWriter u8(int value) {
        bytes.write(value & 0xff);
        return this;
    }

    ProofBytesWriter u16(int value) {
        return u8(value >>> 8).u8(value);
    }

    ProofBytesWriter u24(int value) {
        return u8(value >>> 16).u16(value);
    }

    ProofBytesWriter u32(long value) {
        return u8((int) (value >>> 24)).u24((int) value);
    }

    ProofBytesWriter varint(long value) {
        long rest = value;
        do {
            int group = (int) (rest & 0x7f);
            rest >>>= 7;
            u8(rest == 0 ? group : group | 0x80);
        } while (rest != 0);
        return this;
    }

    ProofBytesWriter raw(byte[] value) {
        bytes.writeBytes(value);
        return this;
    }

    ProofBytesWriter text(String value) {
        byte[] utf8 = value.getBytes(StandardCharsets.UTF_8);
        return varint(utf8.length).raw(utf8);
    }

    byte[] toByteArray() {
        return bytes.toByteArray();
    }
}

package cz.novanadeje.app.content.infrastructure.media;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;

final class ExifOrientation {

    static final int NORMAL = 1;

    private static final int SOI = 0xFFD8;
    private static final int APP1 = 0xFFE1;
    private static final int SOS = 0xFFDA;
    private static final int ORIENTATION_TAG = 0x0112;
    private static final byte[] EXIF_HEADER = {'E', 'x', 'i', 'f', 0, 0};

    private ExifOrientation() {
    }

    static int of(byte[] jpeg) {
        try {
            return read(jpeg);
        } catch (RuntimeException malformed) {
            return NORMAL;
        }
    }

    private static int read(byte[] jpeg) {
        ByteBuffer file = ByteBuffer.wrap(jpeg).order(ByteOrder.BIG_ENDIAN);
        if (file.remaining() < 4 || (file.getShort() & 0xFFFF) != SOI) {
            return NORMAL;
        }
        while (file.remaining() >= 4) {
            int marker = file.getShort() & 0xFFFF;
            int length = file.getShort() & 0xFFFF;
            if (marker == SOS || length < 2) {
                return NORMAL;
            }
            int segmentStart = file.position();
            if (marker == APP1 && length >= 2 + EXIF_HEADER.length + 8 && hasExifHeader(file, segmentStart)) {
                return orientationIn(file, segmentStart + EXIF_HEADER.length, length - 2 - EXIF_HEADER.length);
            }
            file.position(segmentStart + length - 2);
        }
        return NORMAL;
    }

    private static boolean hasExifHeader(ByteBuffer file, int at) {
        for (int i = 0; i < EXIF_HEADER.length; i++) {
            if (file.get(at + i) != EXIF_HEADER[i]) {
                return false;
            }
        }
        return true;
    }

    private static int orientationIn(ByteBuffer file, int tiffStart, int tiffLength) {
        ByteBuffer tiff = file.slice(tiffStart, tiffLength);
        int byteOrder = tiff.getShort(0) & 0xFFFF;
        tiff.order(byteOrder == 0x4949 ? ByteOrder.LITTLE_ENDIAN : ByteOrder.BIG_ENDIAN);
        int firstIfd = tiff.getInt(4);
        int entries = tiff.getShort(firstIfd) & 0xFFFF;
        for (int i = 0; i < entries; i++) {
            int entry = firstIfd + 2 + i * 12;
            if ((tiff.getShort(entry) & 0xFFFF) == ORIENTATION_TAG) {
                int value = tiff.getShort(entry + 8) & 0xFFFF;
                return value >= 1 && value <= 8 ? value : NORMAL;
            }
        }
        return NORMAL;
    }
}

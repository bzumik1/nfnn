package cz.novanadeje.app.shared.application.people;

import java.util.Arrays;

public record PrintSignature(byte[] png, int width, int height) {

    public static final int MAX_WIDTH = 1200;
    public static final int MAX_HEIGHT = 600;
    public static final String MEDIA_TYPE = "image/png";
    private static final byte[] PNG_SIGNATURE = {(byte) 0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n'};

    public PrintSignature {
        if (png == null || png.length <= PNG_SIGNATURE.length
                || !Arrays.equals(png, 0, PNG_SIGNATURE.length, PNG_SIGNATURE, 0, PNG_SIGNATURE.length)) {
            throw new IllegalArgumentException("A signature prepared for print is a PNG");
        }
        if (width < 1 || width > MAX_WIDTH || height < 1 || height > MAX_HEIGHT) {
            throw new IllegalArgumentException("A signature prepared for print is at most " + MAX_WIDTH + "x" + MAX_HEIGHT + " pixels, not " + width + "x"
                    + height);
        }
        png = png.clone();
    }

    @Override
    public byte[] png() {
        return png.clone();
    }

    @Override
    public boolean equals(Object other) {
        return other instanceof PrintSignature signature && signature.width == width && signature.height == height && Arrays.equals(signature.png, png);
    }

    @Override
    public int hashCode() {
        return 31 * (31 * Arrays.hashCode(png) + width) + height;
    }

    @Override
    public String toString() {
        return "PrintSignature[" + png.length + " bytes, " + width + "x" + height + " px]";
    }
}

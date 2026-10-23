package cz.novanadeje.app.donations.domain.receipt;

import java.util.Arrays;

public record SignatureImage(byte[] png, int width, int height) {

    public static final int MAX_WIDTH = 1200;
    public static final int MAX_HEIGHT = 600;
    private static final byte[] PNG_SIGNATURE = {(byte) 0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n'};

    public SignatureImage {
        if (png == null || png.length <= PNG_SIGNATURE.length
                || !Arrays.equals(png, 0, PNG_SIGNATURE.length, PNG_SIGNATURE, 0, PNG_SIGNATURE.length)) {
            throw new IllegalArgumentException("A signature image is stored as a PNG");
        }
        if (width < 1 || width > MAX_WIDTH || height < 1 || height > MAX_HEIGHT) {
            throw new IllegalArgumentException("A signature image is at most " + MAX_WIDTH + "x" + MAX_HEIGHT + " pixels, not " + width + "x" + height);
        }
        png = png.clone();
    }

    @Override
    public byte[] png() {
        return png.clone();
    }

    public ContentDigest digest() {
        return ContentDigest.of(png);
    }

    @Override
    public boolean equals(Object other) {
        return other instanceof SignatureImage image && width == image.width && height == image.height && Arrays.equals(png, image.png);
    }

    @Override
    public int hashCode() {
        return 31 * (31 * Arrays.hashCode(png) + width) + height;
    }

    @Override
    public String toString() {
        return "SignatureImage[" + width + "x" + height + ", " + digest() + "]";
    }
}

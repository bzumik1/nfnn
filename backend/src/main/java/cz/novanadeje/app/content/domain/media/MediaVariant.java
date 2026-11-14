package cz.novanadeje.app.content.domain.media;

import java.util.Arrays;

public record MediaVariant(int width, int height, byte[] webp) {

    public MediaVariant {
        if (width <= 0 || height <= 0) {
            throw new IllegalArgumentException("A media variant has positive dimensions");
        }
        if (webp == null || webp.length == 0) {
            throw new IllegalArgumentException("A media variant carries its WebP bytes");
        }
        webp = webp.clone();
    }

    @Override
    public byte[] webp() {
        return webp.clone();
    }

    public int size() {
        return webp.length;
    }

    @Override
    public boolean equals(Object other) {
        return other instanceof MediaVariant variant && width == variant.width && height == variant.height && Arrays.equals(webp, variant.webp);
    }

    @Override
    public int hashCode() {
        return 31 * (31 * Arrays.hashCode(webp) + width) + height;
    }

    @Override
    public String toString() {
        return "MediaVariant[" + width + "x" + height + ", " + webp.length + " bytes]";
    }
}

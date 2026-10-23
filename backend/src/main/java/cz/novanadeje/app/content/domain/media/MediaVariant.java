package cz.novanadeje.app.content.domain.media;

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
}

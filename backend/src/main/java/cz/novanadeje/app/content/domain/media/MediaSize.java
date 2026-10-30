package cz.novanadeje.app.content.domain.media;

public record MediaSize(int width, int height) {

    public MediaSize {
        if (width <= 0 || height <= 0) {
            throw new IllegalArgumentException("A media image has positive dimensions");
        }
    }
}

package cz.novanadeje.app.content.application.media;

import cz.novanadeje.app.content.domain.media.MediaVariant;

import java.util.List;

public record ProcessedImage(int width, int height, List<MediaVariant> variants) {

    public ProcessedImage {
        if (width <= 0 || height <= 0) {
            throw new IllegalArgumentException("A processed image has positive dimensions");
        }
        if (variants == null || variants.isEmpty()) {
            throw new IllegalArgumentException("A processed image has at least one variant");
        }
        variants = List.copyOf(variants);
    }
}

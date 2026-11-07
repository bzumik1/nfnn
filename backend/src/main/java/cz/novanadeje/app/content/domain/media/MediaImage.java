package cz.novanadeje.app.content.domain.media;

import java.time.Instant;
import java.util.Comparator;
import java.util.List;

public record MediaImage(MediaId id, int width, int height, List<MediaVariant> variants, Instant uploadedAt) {

    public static final List<Integer> VARIANT_WIDTHS = List.of(480, 960, 1440);

    public MediaImage {
        if (id == null || uploadedAt == null) {
            throw new IllegalArgumentException("A media image has an id and an upload time");
        }
        if (width <= 0 || height <= 0) {
            throw new IllegalArgumentException("A media image has positive dimensions");
        }
        if (variants == null || variants.isEmpty()) {
            throw new IllegalArgumentException("A media image has at least one variant");
        }
        variants = variants.stream().sorted(Comparator.comparingInt(MediaVariant::width)).toList();
        if (variants.stream().mapToInt(MediaVariant::width).distinct().count() != variants.size()) {
            throw new IllegalArgumentException("Each variant of a media image has its own width");
        }
    }
}

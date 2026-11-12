package cz.novanadeje.app.content.domain.media;

import java.util.Comparator;
import java.util.List;

public record MediaVariantWidths(List<Integer> widths) {

    public MediaVariantWidths {
        if (widths == null || widths.isEmpty()) {
            throw new IllegalArgumentException("A media image has at least one variant");
        }
        widths = widths.stream().sorted(Comparator.naturalOrder()).toList();
        if (widths.getFirst() <= 0) {
            throw new IllegalArgumentException("A media variant has positive dimensions");
        }
        if (widths.stream().distinct().count() != widths.size()) {
            throw new IllegalArgumentException("Each variant of a media image has its own width");
        }
    }

    public int atLeast(int wanted) {
        return widths.stream().filter(width -> width >= wanted).findFirst().orElse(largest());
    }

    public int largest() {
        return widths.getLast();
    }
}

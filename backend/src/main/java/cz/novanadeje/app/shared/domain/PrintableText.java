package cz.novanadeje.app.shared.domain;

import java.util.List;

public record PrintableText(String text, List<Integer> outside) {

    public PrintableText {
        if (text == null || outside == null) {
            throw new IllegalArgumentException("A printable text needs its text and the code points outside the printable set");
        }
        outside = List.copyOf(outside);
    }

    public static PrintableText of(String raw) {
        return new PrintableText(raw, List.of());
    }

    public boolean prints() {
        return outside.isEmpty();
    }
}

package cz.novanadeje.app.operations.domain.logs;

public record LogWindow(String name, long sizeBytes, long from, long to, String text) {

    public LogWindow {
        if (from < 0 || to < from || to > sizeBytes || text == null) {
            throw new IllegalArgumentException("A log window lies inside its file");
        }
    }

    public boolean hasOlder() {
        return from > 0;
    }

    public boolean hasNewer() {
        return to < sizeBytes;
    }
}

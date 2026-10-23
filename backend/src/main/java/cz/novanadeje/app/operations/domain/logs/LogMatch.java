package cz.novanadeje.app.operations.domain.logs;

public record LogMatch(long offset, String line) {

    public LogMatch {
        if (offset < 0 || line == null) {
            throw new IllegalArgumentException("A log match has an offset and a line");
        }
    }
}

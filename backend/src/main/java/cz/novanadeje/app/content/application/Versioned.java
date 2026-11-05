package cz.novanadeje.app.content.application;

public record Versioned<T>(T view, String version) {

    public Versioned {
        if (view == null || version == null) {
            throw new IllegalArgumentException("A versioned view names its view and its version");
        }
    }
}

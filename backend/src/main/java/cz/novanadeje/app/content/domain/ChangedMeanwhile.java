package cz.novanadeje.app.content.domain;

import cz.novanadeje.app.shared.domain.error.Conflict;

import java.util.Map;

public class ChangedMeanwhile extends Conflict {

    public static final String CODE = "content/changed-meanwhile";

    private final String version;
    private final Object current;

    public ChangedMeanwhile(String version, Object current) {
        super(CODE, "The record changed since the version the request names");
        if (version == null || current == null) {
            throw new IllegalArgumentException("A changed-meanwhile refusal names the current version and the current row");
        }
        this.version = version;
        this.current = current;
    }

    @Override
    public Map<String, Object> extensions() {
        return Map.of("version", version, "current", current);
    }
}

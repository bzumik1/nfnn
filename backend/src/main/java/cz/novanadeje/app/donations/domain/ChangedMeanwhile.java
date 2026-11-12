package cz.novanadeje.app.donations.domain;

import cz.novanadeje.app.shared.domain.error.Conflict;

import java.util.Map;

public class ChangedMeanwhile extends Conflict {

    public static final String CODE = "donations/changed-meanwhile";

    private final Map<String, Object> extensions;

    public ChangedMeanwhile(String version, Object current) {
        this(currentRecord(version, current));
    }

    private ChangedMeanwhile(Map<String, Object> extensions) {
        super(CODE, "The record changed since the version the request names");
        this.extensions = extensions;
    }

    public static ChangedMeanwhile andRemovedSince() {
        return new ChangedMeanwhile(Map.of());
    }

    @Override
    public Map<String, Object> extensions() {
        return extensions;
    }

    private static Map<String, Object> currentRecord(String version, Object current) {
        if (version == null || current == null) {
            throw new IllegalArgumentException("A changed-meanwhile refusal names the current version and the current row");
        }
        return Map.of("version", version, "current", current);
    }
}

package cz.novanadeje.app.donors.domain;

import cz.novanadeje.app.shared.domain.error.Conflict;

import java.util.Map;

public class ProfileChangedMeanwhile extends Conflict {

    public static final String CODE = "donors/changed-meanwhile";

    private final String version;
    private final Object current;

    public ProfileChangedMeanwhile(String version, Object current) {
        super(CODE, "The profile changed since the version the request names");
        if (version == null || current == null) {
            throw new IllegalArgumentException("A changed-meanwhile refusal names the current version and the stored profile");
        }
        this.version = version;
        this.current = current;
    }

    @Override
    public Map<String, Object> extensions() {
        return Map.of("version", version, "current", current);
    }
}

package cz.novanadeje.app.operations.domain.settings;

import cz.novanadeje.app.shared.domain.error.Conflict;

import java.util.Map;

public class SettingsChangedMeanwhile extends Conflict {

    public static final String CODE = "operations/changed-meanwhile";

    private final String version;
    private final Object current;

    public SettingsChangedMeanwhile(String version, Object current) {
        super(CODE, "The settings changed since the version the request names");
        if (version == null || current == null) {
            throw new IllegalArgumentException("A changed-meanwhile refusal names the current version and the stored settings");
        }
        this.version = version;
        this.current = current;
    }

    @Override
    public Map<String, Object> extensions() {
        return Map.of("version", version, "current", current);
    }
}

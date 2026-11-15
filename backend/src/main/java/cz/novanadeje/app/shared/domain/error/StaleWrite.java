package cz.novanadeje.app.shared.domain.error;

import java.util.Map;
import java.util.Optional;

public abstract class StaleWrite extends Conflict {

    private final String version;

    protected StaleWrite(String code, String message, String version) {
        super(code, message);
        if (version == null) {
            throw new IllegalArgumentException("A stale write names the version stored now");
        }
        this.version = version;
    }

    protected StaleWrite(String code, String message) {
        super(code, message);
        this.version = null;
    }

    public Optional<String> version() {
        return Optional.ofNullable(version);
    }

    @Override
    public Map<String, Object> extensions() {
        return version().<Map<String, Object>>map(stored -> Map.of("version", stored)).orElse(Map.of());
    }
}

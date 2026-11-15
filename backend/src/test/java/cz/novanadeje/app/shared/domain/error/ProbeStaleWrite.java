package cz.novanadeje.app.shared.domain.error;

public final class ProbeStaleWrite extends StaleWrite {

    public ProbeStaleWrite(String code, String version) {
        super(code, "A probe of a stale write", version);
    }

    private ProbeStaleWrite(String code) {
        super(code, "A probe of a stale write");
    }

    public static ProbeStaleWrite withoutVersion(String code) {
        return new ProbeStaleWrite(code);
    }
}

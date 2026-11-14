package cz.novanadeje.app.shared.infrastructure.busy;

public enum CpuWork {

    PASSWORD_HASHING("password hashing");

    private final String label;

    CpuWork(String label) {
        this.label = label;
    }

    public String label() {
        return label;
    }
}

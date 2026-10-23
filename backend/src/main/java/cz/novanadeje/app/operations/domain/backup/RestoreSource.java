package cz.novanadeje.app.operations.domain.backup;

public enum RestoreSource {
    BACKUP("backup"), UPLOAD("upload");

    private final String requestValue;

    RestoreSource(String requestValue) {
        this.requestValue = requestValue;
    }

    public String requestValue() {
        return requestValue;
    }
}

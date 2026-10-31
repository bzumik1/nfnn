package cz.novanadeje.app.operations.domain.clienterrors;

public enum ClientErrorBucket {

    GENERAL("general", 100),
    PDF_RENDER("pdf-render", 30),
    PDF_LOAD("pdf-load", 30),
    VERIFY_SIGNATURE("verify-signature", 30);

    private final String wire;
    private final int perHour;

    ClientErrorBucket(String wire, int perHour) {
        this.wire = wire;
        this.perHour = perHour;
    }

    public static ClientErrorBucket of(ClientErrorKind kind) {
        return switch (kind) {
            case PDF_RENDER -> PDF_RENDER;
            case PDF_LOAD -> PDF_LOAD;
            case VERIFY_SIGNATURE -> VERIFY_SIGNATURE;
            case UNEXPECTED, CHUNK_LOAD, QR_ENCODE, VERIFY_PARSE -> GENERAL;
        };
    }

    public String wire() {
        return wire;
    }

    public int perHour() {
        return perHour;
    }
}

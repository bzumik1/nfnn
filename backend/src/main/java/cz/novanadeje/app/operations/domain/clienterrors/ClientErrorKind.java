package cz.novanadeje.app.operations.domain.clienterrors;

public enum ClientErrorKind implements ClientErrorTerm {

    UNEXPECTED("unexpected"),
    CHUNK_LOAD("chunk-load"),
    PDF_RENDER("pdf-render"),
    PDF_LOAD("pdf-load"),
    QR_ENCODE("qr-encode"),
    VERIFY_PARSE("verify-parse"),
    VERIFY_SIGNATURE("verify-signature");

    private final String wire;

    ClientErrorKind(String wire) {
        this.wire = wire;
    }

    @Override
    public String wire() {
        return wire;
    }
}

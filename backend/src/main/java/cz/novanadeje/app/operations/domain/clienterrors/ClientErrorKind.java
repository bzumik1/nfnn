package cz.novanadeje.app.operations.domain.clienterrors;

public enum ClientErrorKind implements ClientErrorTerm {

    UNEXPECTED("unexpected"),
    CHUNK_LOAD("chunk-load"),
    PDF_RENDER("pdf-render"),
    PDF_LOAD("pdf-load"),
    QR_ENCODE("qr-encode"),
    VERIFY_PARSE("verify-parse"),
    VERIFY_SIGNATURE("verify-signature"),
    BOOT("boot"),
    SW_INSTALL("sw-install"),
    SW_UNRECOVERABLE("sw-unrecoverable"),
    DEVICE_STORE_OPEN("device-store-open"),
    DEVICE_STORE_EVICTED("device-store-evicted"),
    DEVICE_COPY_MISMATCH("device-copy-mismatch");

    private final String wire;

    ClientErrorKind(String wire) {
        this.wire = wire;
    }

    @Override
    public String wire() {
        return wire;
    }
}

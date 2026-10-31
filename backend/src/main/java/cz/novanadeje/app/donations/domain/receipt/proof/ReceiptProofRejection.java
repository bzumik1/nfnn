package cz.novanadeje.app.donations.domain.receipt.proof;

public enum ReceiptProofRejection {
    NOT_A_PROOF("not-a-proof"),
    DIGITS("digits"),
    TRUNCATED("truncated"),
    UNKNOWN_FORMAT("unknown-format"),
    UNKNOWN_KEY("unknown-key"),
    REVOKED_KEY("revoked-key"),
    BAD_SIGNATURE("bad-signature"),
    RESERVED_FLAGS("reserved-flags"),
    NON_MINIMAL_VARINT("non-minimal-varint"),
    INVALID_TEXT("invalid-text"),
    INVALID_VALUE("invalid-value"),
    TRAILING_BYTES("trailing-bytes"),
    TOTAL_MISMATCH("total-mismatch");

    private final String code;

    ReceiptProofRejection(String code) {
        this.code = code;
    }

    public String code() {
        return code;
    }
}

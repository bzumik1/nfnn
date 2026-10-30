package cz.novanadeje.app.donations.domain.receipt;

public enum SignatureVectorProblem {
    MALFORMED("malformed"),
    DOCTYPE("doctype"),
    ELEMENT("element"),
    ATTRIBUTE("attribute"),
    TEXT("text"),
    VIEW_BOX("view-box"),
    FILL("fill"),
    OPACITY("opacity"),
    PATH_DATA("path-data"),
    TOO_LARGE("too-large"),
    TOO_COMPLEX("too-complex"),
    NO_PATHS("no-paths");

    private final String code;

    SignatureVectorProblem(String code) {
        this.code = code;
    }

    public String code() {
        return code;
    }
}

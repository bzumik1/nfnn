package cz.novanadeje.app.operations.domain.clienterrors;

public enum ClientDisplayMode implements ClientErrorTerm {

    BROWSER("browser"),
    STANDALONE("standalone");

    private final String wire;

    ClientDisplayMode(String wire) {
        this.wire = wire;
    }

    @Override
    public String wire() {
        return wire;
    }
}

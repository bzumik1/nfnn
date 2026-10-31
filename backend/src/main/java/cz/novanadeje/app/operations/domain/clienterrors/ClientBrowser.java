package cz.novanadeje.app.operations.domain.clienterrors;

public enum ClientBrowser implements ClientErrorTerm {

    CHROME("chrome"),
    EDGE("edge"),
    FIREFOX("firefox"),
    SAFARI("safari"),
    SAMSUNG("samsung"),
    OPERA("opera"),
    OTHER("other");

    private final String wire;

    ClientBrowser(String wire) {
        this.wire = wire;
    }

    @Override
    public String wire() {
        return wire;
    }
}

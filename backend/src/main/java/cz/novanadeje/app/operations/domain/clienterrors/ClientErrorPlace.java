package cz.novanadeje.app.operations.domain.clienterrors;

public enum ClientErrorPlace implements ClientErrorTerm {

    GLOBAL("global"),
    NAVIGATION("navigation"),
    START_UP("start-up"),
    SERVICE_WORKER("service-worker");

    private final String wire;

    ClientErrorPlace(String wire) {
        this.wire = wire;
    }

    @Override
    public String wire() {
        return wire;
    }
}

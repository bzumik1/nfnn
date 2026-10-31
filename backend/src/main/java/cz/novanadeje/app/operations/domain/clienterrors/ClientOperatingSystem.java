package cz.novanadeje.app.operations.domain.clienterrors;

public enum ClientOperatingSystem implements ClientErrorTerm {

    ANDROID("android"),
    IOS("ios"),
    IPADOS("ipados"),
    MACOS("macos"),
    WINDOWS("windows"),
    LINUX("linux"),
    OTHER("other");

    private final String wire;

    ClientOperatingSystem(String wire) {
        this.wire = wire;
    }

    @Override
    public String wire() {
        return wire;
    }
}

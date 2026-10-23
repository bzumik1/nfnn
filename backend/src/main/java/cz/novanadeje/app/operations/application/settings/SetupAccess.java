package cz.novanadeje.app.operations.application.settings;

public record SetupAccess(boolean fromHomeNetwork, String code) {

    @Override
    public String toString() {
        return "SetupAccess[fromHomeNetwork=" + fromHomeNetwork + "]";
    }
}

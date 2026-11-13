package cz.novanadeje.app.shared.application.administration;

public enum AdministrationChannel {

    BROWSER,
    CONNECTED_APPLICATION;

    public boolean isConnectedApplication() {
        return this == CONNECTED_APPLICATION;
    }
}

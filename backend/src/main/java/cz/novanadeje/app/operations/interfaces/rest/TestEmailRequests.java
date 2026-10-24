package cz.novanadeje.app.operations.interfaces.rest;

import cz.novanadeje.app.operations.application.settings.MailServer;

final class TestEmailRequests {

    static final int MAX_HOST_LENGTH = 253;
    static final int MAX_ADDRESS_LENGTH = 254;
    static final int MAX_PASSWORD_LENGTH = 500;
    static final String HOST_PATTERN = "[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?";

    private TestEmailRequests() {
    }

    static MailServer server(String host, int port, String username, String password, boolean auth, boolean startTls) {
        return new MailServer(host, port, username == null ? "" : username, password == null ? "" : password, auth, startTls);
    }
}

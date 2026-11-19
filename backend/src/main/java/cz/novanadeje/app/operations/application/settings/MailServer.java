package cz.novanadeje.app.operations.application.settings;

import cz.novanadeje.app.operations.domain.settings.MailServerAddress;

public record MailServer(String host, int port, String username, String password, boolean auth, boolean startTls) {

    public MailServerAddress address() {
        return new MailServerAddress(host, port, username, startTls);
    }

    public MailServer withPassword(String replacement) {
        return new MailServer(host, port, username, replacement, auth, startTls);
    }

    @Override
    public String toString() {
        return "MailServer[" + host + ":" + port + ", auth=" + auth + ", startTls=" + startTls + "]";
    }
}

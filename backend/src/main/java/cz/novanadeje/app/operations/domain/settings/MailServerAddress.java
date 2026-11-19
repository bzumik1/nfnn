package cz.novanadeje.app.operations.domain.settings;

public record MailServerAddress(String host, int port, String username, boolean startTls) {

    @Override
    public String toString() {
        return "MailServerAddress[" + host + ":" + port + ", startTls=" + startTls + "]";
    }
}

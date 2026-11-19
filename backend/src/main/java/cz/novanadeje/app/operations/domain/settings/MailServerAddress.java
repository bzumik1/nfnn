package cz.novanadeje.app.operations.domain.settings;

public record MailServerAddress(String host, int port, String username, boolean startTls) {
}

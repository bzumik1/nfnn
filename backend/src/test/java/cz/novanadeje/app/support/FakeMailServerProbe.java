package cz.novanadeje.app.support;

import cz.novanadeje.app.operations.application.settings.MailServer;
import cz.novanadeje.app.operations.application.settings.MailServerProbe;

public class FakeMailServerProbe implements MailServerProbe {

    public static final String HOST = "smtp.example.cz";
    public static final String PASSWORD = "right-key";

    @Override
    public boolean canSignIn(MailServer server) {
        return HOST.equals(server.host()) && (!server.auth() || PASSWORD.equals(server.password()));
    }
}

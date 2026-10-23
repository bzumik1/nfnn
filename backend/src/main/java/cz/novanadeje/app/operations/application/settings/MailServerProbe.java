package cz.novanadeje.app.operations.application.settings;

public interface MailServerProbe {

    boolean canSignIn(MailServer server);
}

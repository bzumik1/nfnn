package cz.novanadeje.app.operations.application.settings;

public interface MailServerProbe {

    TestEmailOutcome sendTestEmail(MailServer server, TestEmail email);
}

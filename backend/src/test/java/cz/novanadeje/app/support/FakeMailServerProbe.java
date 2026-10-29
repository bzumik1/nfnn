package cz.novanadeje.app.support;

import cz.novanadeje.app.operations.application.settings.MailServer;
import cz.novanadeje.app.operations.application.settings.MailServerProbe;
import cz.novanadeje.app.operations.application.settings.TestEmail;
import cz.novanadeje.app.operations.application.settings.TestEmailOutcome;

import java.util.Set;

public class FakeMailServerProbe implements MailServerProbe {

    public static final String HOST = "smtp.example.cz";
    public static final String PASSWORD = "right-key";
    public static final String REFUSED_SENDER = "neovereny@example.cz";
    private static final Set<String> REACHABLE = Set.of(HOST, "localhost");

    @Override
    public TestEmailOutcome sendTestEmail(MailServer server, TestEmail email) {
        if (!REACHABLE.contains(server.host())) {
            return TestEmailOutcome.UNREACHABLE;
        }
        if (server.auth() && !PASSWORD.equals(server.password())) {
            return TestEmailOutcome.SIGN_IN_REFUSED;
        }
        if (REFUSED_SENDER.equals(email.sender())) {
            return TestEmailOutcome.SENDER_REFUSED;
        }
        return TestEmailOutcome.SENT;
    }
}

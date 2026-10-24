package cz.novanadeje.app.operations.infrastructure.settings;

import cz.novanadeje.app.operations.application.settings.MailServer;
import cz.novanadeje.app.operations.application.settings.TestEmail;
import cz.novanadeje.app.operations.application.settings.TestEmailOutcome;
import cz.novanadeje.app.support.Emails;
import cz.novanadeje.app.support.MailContents;
import cz.novanadeje.app.support.MailPreviews;
import jakarta.mail.Session;
import jakarta.mail.internet.MimeMessage;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.JavaMailSenderImpl;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.PrintWriter;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.Properties;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicBoolean;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class JavaMailServerProbeTest {

    private static final TestEmail EMAIL = new TestEmail("info@nfnn.cz", "spravce@example.cz");
    private static final Duration SHORT_TIMEOUT = Duration.ofMillis(500);

    private final JavaMailSender runningSender = mock(JavaMailSender.class);
    private final JavaMailServerProbe probe;
    private final AtomicBoolean passwordSent = new AtomicBoolean();
    private final List<String> received = new CopyOnWriteArrayList<>();
    private ServerSocket server;

    JavaMailServerProbeTest() {
        when(runningSender.createMimeMessage()).thenAnswer(invocation -> new MimeMessage(Session.getInstance(new Properties())));
        probe = new JavaMailServerProbe(Emails.branded(runningSender, "running@nfnn.cz", "https://nfnn.cz"), Emails.messages(), SHORT_TIMEOUT);
    }

    @AfterEach
    void stopServer() throws IOException {
        if (server != null) {
            server.close();
        }
    }

    @Test
    @DisplayName("Given a server that takes the e-mail, when a test e-mail is sent, then it goes from the typed sender to the recipient and says it was sent")
    void should_send_from_typed_sender_when_test_email_sent_given_accepting_server() throws IOException {
        start(new Script());

        TestEmailOutcome outcome = probe.sendTestEmail(server("secret-key", false), EMAIL);

        assertThat(outcome).isEqualTo(TestEmailOutcome.SENT);
        assertThat(passwordSent).isTrue();
        assertThat(received).anyMatch(line -> line.equalsIgnoreCase("MAIL FROM:<info@nfnn.cz>"));
        assertThat(received).anyMatch(line -> line.equalsIgnoreCase("RCPT TO:<spravce@example.cz>"));
        assertThat(String.join("\n", received)).contains("Subject: =?UTF-8?").contains("To: spravce@example.cz");
    }

    @Test
    @DisplayName("Given a server that does not offer STARTTLS, when the test asks for STARTTLS, then it fails before the password goes out in plain text")
    void should_fail_without_sending_password_when_test_email_sent_given_server_without_starttls() throws IOException {
        start(new Script());

        TestEmailOutcome outcome = probe.sendTestEmail(server("secret-key", true), EMAIL);

        assertThat(outcome).isEqualTo(TestEmailOutcome.STARTTLS_UNAVAILABLE);
        assertThat(passwordSent).isFalse();
    }

    @Test
    @DisplayName("Given a server that refuses the login, when a test e-mail is sent, then it says the sign-in was refused")
    void should_report_refused_sign_in_when_test_email_sent_given_wrong_password() throws IOException {
        start(new Script().auth("535 5.7.8 Authentication failed"));

        assertThat(probe.sendTestEmail(server("wrong-key", false), EMAIL)).isEqualTo(TestEmailOutcome.SIGN_IN_REFUSED);
    }

    @Test
    @DisplayName("Given a server that refuses the sender, when a test e-mail is sent, then it says the sender was refused")
    void should_report_refused_sender_when_test_email_sent_given_unverified_sender() throws IOException {
        start(new Script().mailFrom("550 5.7.1 Sender not allowed"));

        assertThat(probe.sendTestEmail(server("secret-key", false), EMAIL)).isEqualTo(TestEmailOutcome.SENDER_REFUSED);
    }

    @Test
    @DisplayName("Given a server that refuses the message after its content, when a test e-mail is sent, then it says the sender was refused")
    void should_report_refused_sender_when_test_email_sent_given_message_refused_after_data() throws IOException {
        start(new Script().endOfData("550 5.7.1 Sender domain is not verified"));

        assertThat(probe.sendTestEmail(server("secret-key", false), EMAIL)).isEqualTo(TestEmailOutcome.SENDER_REFUSED);
    }

    @Test
    @DisplayName("Given a server that refuses the recipient, when a test e-mail is sent, then it says the recipient was refused")
    void should_report_refused_recipient_when_test_email_sent_given_unknown_recipient() throws IOException {
        start(new Script().rcptTo("550 5.1.1 No such user"));

        assertThat(probe.sendTestEmail(server("secret-key", false), EMAIL)).isEqualTo(TestEmailOutcome.RECIPIENT_REFUSED);
    }

    @Test
    @DisplayName("Given nothing listening at the port, when a test e-mail is sent, then it says the server cannot be reached")
    void should_report_unreachable_when_test_email_sent_given_closed_port() throws IOException {
        int closedPort;
        try (ServerSocket closed = new ServerSocket(0, 1, InetAddress.getLoopbackAddress())) {
            closedPort = closed.getLocalPort();
        }

        TestEmailOutcome outcome = probe.sendTestEmail(new MailServer("127.0.0.1", closedPort, "user", "secret-key", true, false), EMAIL);

        assertThat(outcome).isEqualTo(TestEmailOutcome.UNREACHABLE);
    }

    @Test
    @DisplayName("Given a server that never answers, when a test e-mail is sent, then it gives up after the timeout and says so")
    void should_report_timeout_when_test_email_sent_given_silent_server() throws IOException {
        start(new Script().silent());

        assertThat(probe.sendTestEmail(server("secret-key", false), EMAIL)).isEqualTo(TestEmailOutcome.TIMEOUT);
    }

    @Test
    @DisplayName("Given a test e-mail, when it is composed, then it says through which server and from which address it went and that nothing was saved")
    void should_describe_server_and_sender_when_composed_given_test_email() throws Exception {
        MimeMessage email = probe.compose(new MailServer("smtp-relay.brevo.com", 587, "user", "secret-key", true, true), EMAIL,
                new JavaMailSenderImpl());

        MailPreviews.save("operations-test-email", email);
        assertThat(email.getSubject()).isEqualTo("Zkušební e-mail – Nová naděje");
        assertThat(email.getFrom()[0].toString()).contains("info@nfnn.cz");
        String text = MailContents.plainText(email);
        assertThat(text).contains("smtp-relay.brevo.com:587").contains("info@nfnn.cz").contains("neuložilo").doesNotContain("secret-key");
        assertThat(MailContents.html(email)).contains("smtp-relay.brevo.com:587").contains("Zkušební e-mail");
    }

    private MailServer server(String password, boolean startTls) {
        return new MailServer("127.0.0.1", server.getLocalPort(), "user", password, true, startTls);
    }

    private void start(Script script) throws IOException {
        server = new ServerSocket(0, 1, InetAddress.getLoopbackAddress());
        Thread.ofVirtual().start(() -> {
            while (!server.isClosed()) {
                try (Socket client = server.accept()) {
                    converse(client, script);
                } catch (IOException closed) {
                    return;
                }
            }
        });
    }

    private void converse(Socket client, Script script) throws IOException {
        BufferedReader in = new BufferedReader(new InputStreamReader(client.getInputStream(), StandardCharsets.US_ASCII));
        PrintWriter out = new PrintWriter(client.getOutputStream(), true, StandardCharsets.US_ASCII);
        if (script.silent) {
            while (in.readLine() != null) {
                received.add("ignored");
            }
            return;
        }
        reply(out, "220 plain.example ESMTP");
        boolean inData = false;
        String line;
        while ((line = in.readLine()) != null) {
            received.add(line);
            if (inData) {
                if (line.equals(".")) {
                    inData = false;
                    reply(out, script.endOfData);
                }
                continue;
            }
            String command = line.toUpperCase();
            if (command.startsWith("EHLO")) {
                reply(out, "250-plain.example\r\n250 AUTH PLAIN LOGIN");
            } else if (command.startsWith("AUTH")) {
                passwordSent.set(true);
                reply(out, script.auth);
            } else if (command.startsWith("MAIL FROM")) {
                reply(out, script.mailFrom);
            } else if (command.startsWith("RCPT TO")) {
                reply(out, script.rcptTo);
            } else if (command.startsWith("DATA")) {
                inData = true;
                reply(out, "354 Go ahead");
            } else if (command.startsWith("QUIT")) {
                reply(out, "221 Bye");
                return;
            } else {
                reply(out, "250 OK");
            }
        }
    }

    private static void reply(PrintWriter out, String line) {
        out.print(line + "\r\n");
        out.flush();
    }

    private static final class Script {
        private String auth = "235 2.7.0 Accepted";
        private String mailFrom = "250 OK";
        private String rcptTo = "250 OK";
        private String endOfData = "250 Queued";
        private boolean silent;

        Script auth(String reply) {
            auth = reply;
            return this;
        }

        Script mailFrom(String reply) {
            mailFrom = reply;
            return this;
        }

        Script rcptTo(String reply) {
            rcptTo = reply;
            return this;
        }

        Script endOfData(String reply) {
            endOfData = reply;
            return this;
        }

        Script silent() {
            silent = true;
            return this;
        }
    }
}

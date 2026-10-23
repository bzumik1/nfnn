package cz.novanadeje.app.operations.infrastructure.settings;

import cz.novanadeje.app.operations.application.settings.MailServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.PrintWriter;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicBoolean;

import static org.assertj.core.api.Assertions.assertThat;

class JavaMailServerProbeTest {

    private ServerSocket server;
    private final AtomicBoolean passwordSent = new AtomicBoolean();

    @BeforeEach
    void startPlainServer() throws IOException {
        server = new ServerSocket(0, 1, InetAddress.getLoopbackAddress());
        Thread.ofVirtual().start(() -> {
            while (!server.isClosed()) {
                try (Socket client = server.accept()) {
                    converse(client);
                } catch (IOException closed) {
                    return;
                }
            }
        });
    }

    @AfterEach
    void stopServer() throws IOException {
        server.close();
    }

    @Test
    @DisplayName("Given a server that does not offer STARTTLS, when the test asks for STARTTLS, then it fails before the password goes out in plain text")
    void should_fail_without_sending_password_when_tested_given_server_without_starttls() {
        boolean signedIn = new JavaMailServerProbe().canSignIn(
                new MailServer("127.0.0.1", server.getLocalPort(), "user", "secret-key", true, true));

        assertThat(signedIn).isFalse();
        assertThat(passwordSent).isFalse();
    }

    private void converse(Socket client) throws IOException {
        BufferedReader in = new BufferedReader(new InputStreamReader(client.getInputStream(), StandardCharsets.US_ASCII));
        PrintWriter out = new PrintWriter(client.getOutputStream(), true, StandardCharsets.US_ASCII);
        out.print("220 plain.example ESMTP\r\n");
        out.flush();
        String line;
        while ((line = in.readLine()) != null) {
            String command = line.toUpperCase();
            if (command.startsWith("EHLO")) {
                out.print("250-plain.example\r\n250 AUTH PLAIN LOGIN\r\n");
            } else if (command.startsWith("AUTH")) {
                passwordSent.set(true);
                out.print("235 2.7.0 Accepted\r\n");
            } else if (command.startsWith("QUIT")) {
                out.print("221 Bye\r\n");
                out.flush();
                return;
            } else {
                out.print("250 OK\r\n");
            }
            out.flush();
        }
    }
}

package cz.novanadeje.app.operations.infrastructure.settings;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.mock.env.MockEnvironment;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFilePermissions;

import static org.assertj.core.api.Assertions.assertThat;

class TunnelTokenWriterTest {

    @TempDir
    private Path tunnel;

    @Test
    @DisplayName("Given a tunnel token, when the backend is ready, then the token file holds it and cloudflared can read it")
    void should_write_token_when_ready_given_token() throws IOException {
        writer(new MockEnvironment().withProperty("TUNNEL_TOKEN", " eyJh-token ")).write();

        Path token = tunnel.resolve(TunnelTokenWriter.TOKEN_FILE);
        assertThat(token).hasContent("eyJh-token");
        assertThat(PosixFilePermissions.toString(Files.getPosixFilePermissions(token))).isEqualTo("rw-r--r--");
    }

    @Test
    @DisplayName("Given no tunnel token, when the backend is ready, then an earlier token file is removed")
    void should_remove_token_when_ready_given_no_token() throws IOException {
        Files.writeString(tunnel.resolve(TunnelTokenWriter.TOKEN_FILE), "old");

        writer(new MockEnvironment()).write();

        assertThat(tunnel.resolve(TunnelTokenWriter.TOKEN_FILE)).doesNotExist();
    }

    @Test
    @DisplayName("Given no tunnel folder, when the backend is ready, then nothing is written and nothing fails")
    void should_skip_when_ready_given_no_folder() {
        new TunnelTokenWriter(new SettingsProperties(false, null, tunnel.resolve("missing")), new MockEnvironment().withProperty("TUNNEL_TOKEN", "t"))
                .write();

        assertThat(tunnel.resolve("missing")).doesNotExist();
    }

    private TunnelTokenWriter writer(MockEnvironment environment) {
        return new TunnelTokenWriter(new SettingsProperties(false, null, tunnel), environment);
    }
}

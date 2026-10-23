package cz.novanadeje.app.donors.domain;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.net.URI;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ClientMetadataTest {

    private static final ClientId CLAUDE = new ClientId("https://claude.ai/.well-known/oauth-client");

    @Test
    @DisplayName("Given the exact registered address, when a redirect is asked, then it is allowed")
    void should_allow_a_redirect_when_asked_given_the_exact_registered_address() {
        ClientMetadata metadata = new ClientMetadata(CLAUDE, "Claude", List.of(URI.create("https://claude.ai/api/mcp/auth_callback")));

        assertThat(metadata.allowsRedirect(URI.create("https://claude.ai/api/mcp/auth_callback"))).isTrue();
        assertThat(metadata.allowsRedirect(URI.create("https://claude.ai/api/mcp/auth_callback/"))).isFalse();
        assertThat(metadata.allowsRedirect(URI.create("https://claude.ai/other"))).isFalse();
        assertThat(metadata.allowsRedirect(URI.create("http://claude.ai/api/mcp/auth_callback"))).isFalse();
    }

    @Test
    @DisplayName("Given a loopback redirect address, when a redirect is asked, then the port is ignored")
    void should_ignore_the_port_when_asked_given_a_loopback_redirect_address() {
        ClientMetadata metadata = new ClientMetadata(CLAUDE, "Claude Code",
                List.of(URI.create("http://localhost/callback"), URI.create("http://127.0.0.1/callback")));

        assertThat(metadata.allowsRedirect(URI.create("http://localhost:3118/callback"))).isTrue();
        assertThat(metadata.allowsRedirect(URI.create("http://127.0.0.1:50321/callback"))).isTrue();
        assertThat(metadata.allowsRedirect(URI.create("http://localhost:3118/other"))).isFalse();
        assertThat(metadata.allowsRedirect(URI.create("http://[::1]:3118/callback"))).isFalse();
        assertThat(metadata.allowsRedirect(URI.create("http://evil.example:3118/callback"))).isFalse();
    }

    @Test
    @DisplayName("Given either loopback host, when asked, then it is told to be a loopback redirect")
    void should_tell_a_loopback_redirect_when_asked_given_either_loopback_host() {
        assertThat(ClientMetadata.isLoopback(URI.create("http://localhost:3118/callback"))).isTrue();
        assertThat(ClientMetadata.isLoopback(URI.create("http://127.0.0.1/callback"))).isTrue();
        assertThat(ClientMetadata.isLoopback(URI.create("http://[::1]/callback"))).isTrue();
        assertThat(ClientMetadata.isLoopback(URI.create("https://claude.ai/api/mcp/auth_callback"))).isFalse();
    }

    @Test
    @DisplayName("Given a blank client name, when the name is asked, then it falls back to the host")
    void should_fall_back_to_the_host_when_asked_for_the_name_given_a_blank_client_name() {
        assertThat(new ClientMetadata(CLAUDE, " ", List.of()).displayName()).isEqualTo("claude.ai");
        assertThat(new ClientMetadata(CLAUDE, null, List.of()).displayName()).isEqualTo("claude.ai");
        assertThat(new ClientMetadata(CLAUDE, "Claude", List.of()).displayName()).isEqualTo("Claude");
    }

    @Test
    @DisplayName("Given a redirect without a scheme or host, or an http one off the loopback, when the metadata is created, then it is refused")
    void should_refuse_when_created_given_a_redirect_address_without_a_scheme_or_host_or_an_http_address_off_the_loopback() {
        assertThatThrownBy(() -> new ClientMetadata(CLAUDE, "Claude", List.of(URI.create("/callback")))).isInstanceOf(InvalidClient.class);
        assertThatThrownBy(() -> new ClientMetadata(CLAUDE, "Claude", List.of(URI.create("http://claude.ai/callback")))).isInstanceOf(InvalidClient.class);
        assertThatThrownBy(() -> new ClientMetadata(CLAUDE, "Claude", List.of(URI.create("https://claude.ai/callback#x")))).isInstanceOf(InvalidClient.class);
    }
}

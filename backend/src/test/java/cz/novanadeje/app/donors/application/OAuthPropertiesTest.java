package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.ClientId;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;

import java.time.Duration;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

class OAuthPropertiesTest {

    private static final List<String> CLAUDE_ONLY = List.of("claude.ai");

    @Test
    @DisplayName("Given addresses with trailing slashes, when the properties are made, then the slashes are dropped and the endpoint is composed")
    void should_trim_slashes_and_compose_endpoint_when_made() {
        OAuthProperties properties = new OAuthProperties("https://nfnn.cz/", "/pripojeni", Duration.ofMinutes(5), "https://nfnn.cz/mcp/",
                "https://nfnn.cz/api", CLAUDE_ONLY);

        assertThat(properties.issuer()).isEqualTo("https://nfnn.cz");
        assertThat(properties.mcpResource()).isEqualTo("https://nfnn.cz/mcp");
        assertThat(properties.authorizationEndpoint()).isEqualTo("https://nfnn.cz/pripojeni");
    }

    @ParameterizedTest
    @NullSource
    @ValueSource(strings = {"", "nfnn.cz", "ftp://nfnn.cz"})
    @DisplayName("Given a missing or non-HTTP issuer, when the properties are made, then they fail naming the property")
    void should_fail_when_made_given_bad_issuer(String issuer) {
        assertThatIllegalArgumentException()
                .isThrownBy(() -> new OAuthProperties(issuer, "/pripojeni", Duration.ofMinutes(5), "https://nfnn.cz/mcp", "https://nfnn.cz/api", CLAUDE_ONLY))
                .withMessageContaining("app.donors.oauth.issuer");
    }

    @Test
    @DisplayName("Given a relative authorization path without a slash or a zero code lifetime, when the properties are made, then they fail")
    void should_fail_when_made_given_bad_path_or_ttl() {
        assertThatIllegalArgumentException()
                .isThrownBy(() -> new OAuthProperties("https://nfnn.cz", "pripojeni", Duration.ofMinutes(5), "https://nfnn.cz/mcp", "https://nfnn.cz/api", CLAUDE_ONLY))
                .withMessageContaining("authorization-path");
        assertThatIllegalArgumentException()
                .isThrownBy(() -> new OAuthProperties("https://nfnn.cz", "/pripojeni", Duration.ZERO, "https://nfnn.cz/mcp", "https://nfnn.cz/api", CLAUDE_ONLY))
                .withMessageContaining("authorization-code-ttl");
    }

    @Test
    @DisplayName("Given allowed client hosts with spaces, capitals and a blank entry, when a client is checked, then only a listed host is allowed, whatever its case")
    void should_allow_only_listed_hosts_when_checked_given_untidy_list() {
        OAuthProperties properties = new OAuthProperties("https://nfnn.cz", "/pripojeni", Duration.ofMinutes(5), "https://nfnn.cz/mcp",
                "https://nfnn.cz/api", List.of(" Claude.AI ", ""));

        assertThat(properties.allowedClientHosts()).containsExactly("claude.ai");
        assertThat(properties.allowsClient(new ClientId("https://claude.ai/oauth/mcp-oauth-client-metadata"))).isTrue();
        assertThat(properties.allowsClient(new ClientId("https://CLAUDE.ai/oauth/claude-code-client-metadata"))).isTrue();
        assertThat(properties.allowsClient(new ClientId("https://claude.ai.evil.example/client"))).isFalse();
        assertThat(properties.allowsClient(new ClientId("https://evil.example/claude.ai"))).isFalse();
    }

    @Test
    @DisplayName("Given no allowed client hosts, when a client is checked, then every client may ask to connect")
    void should_allow_every_client_when_checked_given_empty_list() {
        OAuthProperties properties = new OAuthProperties("https://nfnn.cz", "/pripojeni", Duration.ofMinutes(5), "https://nfnn.cz/mcp",
                "https://nfnn.cz/api", null);

        assertThat(properties.allowedClientHosts()).isEmpty();
        assertThat(properties.allowsClient(new ClientId("https://other.example/client"))).isTrue();
    }
}

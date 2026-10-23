package cz.novanadeje.app.donors.application;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;

import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

class OAuthPropertiesTest {

    @Test
    @DisplayName("Given addresses with trailing slashes, when the properties are made, then the slashes are dropped and the endpoint is composed")
    void should_trim_slashes_and_compose_endpoint_when_made() {
        OAuthProperties properties = new OAuthProperties("https://nfnn.cz/", "/pripojeni", Duration.ofMinutes(5), "https://nfnn.cz/mcp/",
                "https://nfnn.cz/api");

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
                .isThrownBy(() -> new OAuthProperties(issuer, "/pripojeni", Duration.ofMinutes(5), "https://nfnn.cz/mcp", "https://nfnn.cz/api"))
                .withMessageContaining("app.donors.oauth.issuer");
    }

    @Test
    @DisplayName("Given a relative authorization path without a slash or a zero code lifetime, when the properties are made, then they fail")
    void should_fail_when_made_given_bad_path_or_ttl() {
        assertThatIllegalArgumentException()
                .isThrownBy(() -> new OAuthProperties("https://nfnn.cz", "pripojeni", Duration.ofMinutes(5), "https://nfnn.cz/mcp", "https://nfnn.cz/api"))
                .withMessageContaining("authorization-path");
        assertThatIllegalArgumentException()
                .isThrownBy(() -> new OAuthProperties("https://nfnn.cz", "/pripojeni", Duration.ZERO, "https://nfnn.cz/mcp", "https://nfnn.cz/api"))
                .withMessageContaining("authorization-code-ttl");
    }
}

package cz.novanadeje.app.donors.infrastructure.oauth;

import cz.novanadeje.app.donors.domain.ClientId;
import cz.novanadeje.app.donors.domain.ClientMetadata;
import cz.novanadeje.app.donors.domain.InvalidClient;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.net.URI;
import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ClientMetadataDocumentsTest {

    private static final ClientId CLAUDE = new ClientId("https://claude.ai/.well-known/oauth-client");

    private final ClientMetadataDocuments documents = new ClientMetadataDocuments();

    @Test
    @DisplayName("Given Claude's document, when it is parsed, then the name and redirect addresses are read")
    void should_read_name_and_redirects_when_parsed_given_valid_document() {
        ClientMetadata metadata = parse("""
                {"client_id":"https://claude.ai/.well-known/oauth-client","client_name":"Claude",
                 "redirect_uris":["https://claude.ai/api/mcp/auth_callback"],"token_endpoint_auth_method":"none"}""");

        assertThat(metadata.clientId()).isEqualTo(CLAUDE);
        assertThat(metadata.displayName()).isEqualTo("Claude");
        assertThat(metadata.redirectUris()).containsExactly(URI.create("https://claude.ai/api/mcp/auth_callback"));
    }

    @Test
    @DisplayName("Given a document without a name, when it is parsed, then the host stands in for the name and a long name is cut")
    void should_fall_back_to_host_when_parsed_given_no_name() {
        assertThat(parse("""
                {"client_id":"https://claude.ai/.well-known/oauth-client","redirect_uris":["https://claude.ai/api/mcp/auth_callback"]}""")
                .displayName()).isEqualTo("claude.ai");
        assertThat(parse("{\"client_id\":\"https://claude.ai/.well-known/oauth-client\",\"client_name\":\"" + "x".repeat(150)
                + "\",\"redirect_uris\":[\"https://claude.ai/api/mcp/auth_callback\"]}").displayName()).hasSize(100);
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "not json",
            "[]",
            "{\"redirect_uris\":[\"https://claude.ai/api/mcp/auth_callback\"]}",
            "{\"client_id\":\"https://other.example/client\",\"redirect_uris\":[\"https://claude.ai/api/mcp/auth_callback\"]}",
            "{\"client_id\":\"https://claude.ai/.well-known/oauth-client\"}",
            "{\"client_id\":\"https://claude.ai/.well-known/oauth-client\",\"redirect_uris\":[]}",
            "{\"client_id\":\"https://claude.ai/.well-known/oauth-client\",\"redirect_uris\":[42]}",
            "{\"client_id\":\"https://claude.ai/.well-known/oauth-client\",\"redirect_uris\":[\"https://claude.ai/cb#fragment\"]}",
            "{\"client_id\":\"https://claude.ai/.well-known/oauth-client\",\"redirect_uris\":[\"http://claude.ai/cb\"]}"})
    @DisplayName("Given a malformed document, when it is parsed, then the client is invalid")
    void should_refuse_when_parsed_given_malformed_document(String document) {
        assertThatThrownBy(() -> parse(document)).isInstanceOf(InvalidClient.class);
    }

    private ClientMetadata parse(String document) {
        return documents.parse(document.getBytes(StandardCharsets.UTF_8), CLAUDE);
    }
}

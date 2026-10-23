package cz.novanadeje.app.support;

import cz.novanadeje.app.donors.application.ClientMetadataSource;
import cz.novanadeje.app.donors.domain.ClientId;
import cz.novanadeje.app.donors.domain.ClientMetadata;
import cz.novanadeje.app.donors.domain.InvalidClient;

import java.net.URI;
import java.util.List;
import java.util.Map;

public class FakeClientMetadataSource implements ClientMetadataSource {

    public static final String CLAUDE = "https://claude.ai/.well-known/oauth-client";
    public static final String CLAUDE_CODE = "https://claude.ai/oauth/claude-code-client-metadata";
    public static final String CLAUDE_CALLBACK = "https://claude.ai/api/mcp/auth_callback";

    private static final Map<String, ClientMetadata> DOCUMENTS = Map.of(
            CLAUDE, new ClientMetadata(new ClientId(CLAUDE), "Claude", List.of(URI.create(CLAUDE_CALLBACK))),
            CLAUDE_CODE, new ClientMetadata(new ClientId(CLAUDE_CODE), "Claude Code",
                    List.of(URI.create("http://localhost/callback"), URI.create("http://127.0.0.1/callback"))));

    @Override
    public ClientMetadata fetch(ClientId clientId) {
        ClientMetadata metadata = DOCUMENTS.get(clientId.value());
        if (metadata == null) {
            throw new InvalidClient("the client metadata document could not be read");
        }
        return metadata;
    }
}

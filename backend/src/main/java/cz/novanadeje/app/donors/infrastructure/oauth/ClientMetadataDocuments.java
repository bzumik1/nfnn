package cz.novanadeje.app.donors.infrastructure.oauth;

import cz.novanadeje.app.donors.domain.ClientId;
import cz.novanadeje.app.donors.domain.ClientMetadata;
import cz.novanadeje.app.donors.domain.InvalidClient;
import org.springframework.stereotype.Component;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.ArrayList;
import java.util.List;

@Component
class ClientMetadataDocuments {

    private static final String CLIENT_ID = "client_id";
    private static final String CLIENT_NAME = "client_name";
    private static final String REDIRECT_URIS = "redirect_uris";
    private static final int MAX_REDIRECTS = 20;
    private static final int MAX_NAME_LENGTH = 100;

    private final JsonMapper mapper = JsonMapper.builder().build();

    ClientMetadata parse(byte[] document, ClientId clientId) {
        JsonNode root;
        try {
            root = mapper.readTree(document);
        } catch (JacksonException malformed) {
            throw new InvalidClient("the client metadata document is not valid JSON");
        }
        if (root == null || !root.isObject()) {
            throw new InvalidClient("the client metadata document must be a JSON object");
        }
        JsonNode id = root.get(CLIENT_ID);
        if (id == null || !id.isString() || !clientId.value().equals(id.asString())) {
            throw new InvalidClient("the client metadata document names another client_id");
        }
        JsonNode redirects = root.get(REDIRECT_URIS);
        if (redirects == null || !redirects.isArray() || redirects.isEmpty() || redirects.size() > MAX_REDIRECTS) {
            throw new InvalidClient("the client metadata document must list between 1 and " + MAX_REDIRECTS + " redirect_uris");
        }
        List<URI> redirectUris = new ArrayList<>();
        for (JsonNode redirect : redirects) {
            if (!redirect.isString()) {
                throw new InvalidClient("every redirect_uri must be a string");
            }
            try {
                redirectUris.add(new URI(redirect.asString()));
            } catch (URISyntaxException malformed) {
                throw new InvalidClient("a redirect_uri is not a valid address");
            }
        }
        JsonNode name = root.get(CLIENT_NAME);
        String clientName = name != null && name.isString() ? name.asString() : null;
        if (clientName != null && clientName.length() > MAX_NAME_LENGTH) {
            clientName = clientName.substring(0, MAX_NAME_LENGTH);
        }
        return new ClientMetadata(clientId, clientName, redirectUris);
    }
}

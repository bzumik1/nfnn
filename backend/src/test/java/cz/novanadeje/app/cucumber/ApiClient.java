package cz.novanadeje.app.cucumber;

import io.cucumber.spring.ScenarioScope;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.util.Map;

@Component
@ScenarioScope
public class ApiClient {

    private final RestClient client;
    private final JsonMapper jsonMapper = JsonMapper.builder().build();
    private ResponseEntity<String> lastResponse;

    public ApiClient(@LocalServerPort int port) {
        this.client = RestClient.builder()
                .baseUrl("http://localhost:" + port)
                .defaultStatusHandler(status -> true, (request, response) -> {
                })
                .build();
    }

    public ResponseEntity<String> post(String path, Map<String, ?> body) {
        lastResponse = client.post()
                .uri(path)
                .contentType(MediaType.APPLICATION_JSON)
                .body(body)
                .retrieve()
                .toEntity(String.class);
        return lastResponse;
    }

    public ResponseEntity<String> lastResponse() {
        return lastResponse;
    }

    public JsonNode lastResponseJson() {
        return jsonMapper.readTree(lastResponse.getBody());
    }
}

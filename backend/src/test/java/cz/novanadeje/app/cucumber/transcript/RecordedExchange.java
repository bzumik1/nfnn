package cz.novanadeje.app.cucumber.transcript;

import org.springframework.http.HttpHeaders;
import tools.jackson.databind.JsonNode;

import java.util.Map;

public record RecordedExchange(String method, String uri, Map<String, String> requestHeaders, JsonNode requestBody,
                               int status, HttpHeaders responseHeaders, byte[] responseBody) {
}

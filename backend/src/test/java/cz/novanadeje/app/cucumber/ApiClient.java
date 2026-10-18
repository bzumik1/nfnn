package cz.novanadeje.app.cucumber;

import io.cucumber.spring.ScenarioScope;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;

@Component
@ScenarioScope
public class ApiClient {

    private final RestClient client;
    private final int port;
    private final JsonMapper jsonMapper = JsonMapper.builder().build();
    private final Map<String, String> defaultHeaders = new LinkedHashMap<>();
    private ResponseEntity<String> lastResponse;
    private byte[] lastResponseBytes;

    public ApiClient(@LocalServerPort int port) {
        this.port = port;
        this.client = RestClient.builder()
                .baseUrl("http://localhost:" + port)
                .defaultStatusHandler(status -> true, (request, response) -> {
                })
                .build();
    }

    public ResponseEntity<String> post(String path, Map<String, ?> body) {
        return exchange(HttpMethod.POST, path, body);
    }

    public ResponseEntity<String> patch(String path, Map<String, ?> body) {
        return exchange(HttpMethod.PATCH, path, body);
    }

    public ResponseEntity<String> get(String path) {
        return exchange(HttpMethod.GET, path, null);
    }

    public ResponseEntity<byte[]> getBytes(String path) {
        ResponseEntity<byte[]> response = client.get()
                .uri(path)
                .headers(headers -> defaultHeaders.forEach(headers::set))
                .retrieve()
                .toEntity(byte[].class);
        lastResponseBytes = response.getBody() == null ? new byte[0] : response.getBody();
        lastResponse = ResponseEntity.status(response.getStatusCode())
                .headers(response.getHeaders())
                .body(new String(lastResponseBytes, StandardCharsets.UTF_8));
        return response;
    }

    public ResponseEntity<String> postRaw(String path, String json, Map<String, String> headers) {
        byte[] body = json.getBytes(StandardCharsets.UTF_8);
        StringBuilder request = new StringBuilder("POST " + path + " HTTP/1.1\r\n");
        headers.forEach((name, value) -> request.append(name).append(": ").append(value).append("\r\n"));
        request.append("Content-Type: application/json\r\n")
                .append("Content-Length: ").append(body.length).append("\r\n")
                .append("Connection: close\r\n\r\n");
        try (Socket socket = new Socket("localhost", port)) {
            OutputStream out = socket.getOutputStream();
            out.write(request.toString().getBytes(StandardCharsets.ISO_8859_1));
            out.write(body);
            out.flush();
            InputStream in = socket.getInputStream();
            String raw = new String(in.readAllBytes(), StandardCharsets.UTF_8);
            int status = Integer.parseInt(raw.split(" ", 3)[1]);
            int bodyStart = raw.indexOf("\r\n\r\n");
            lastResponse = ResponseEntity.status(status).body(bodyStart < 0 ? "" : raw.substring(bodyStart + 4));
            lastResponseBytes = null;
            return lastResponse;
        } catch (IOException unreachable) {
            throw new IllegalStateException("The raw request to " + path + " failed", unreachable);
        }
    }

    public void authorize(String accessToken) {
        defaultHeaders.put(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken);
    }

    public void acceptLanguage(String languageTag) {
        defaultHeaders.put(HttpHeaders.ACCEPT_LANGUAGE, languageTag);
    }

    public void sendCookie(String cookie) {
        defaultHeaders.put(HttpHeaders.COOKIE, cookie);
    }

    public void forgetCredentials() {
        defaultHeaders.clear();
    }

    public ResponseEntity<String> lastResponse() {
        return lastResponse;
    }

    public byte[] lastResponseBytes() {
        if (lastResponseBytes == null) {
            throw new IllegalStateException("No binary response was read in this scenario");
        }
        return lastResponseBytes.clone();
    }

    public JsonNode lastResponseJson() {
        return jsonMapper.readTree(lastResponse.getBody());
    }

    private ResponseEntity<String> exchange(HttpMethod method, String path, Map<String, ?> body) {
        RestClient.RequestBodySpec request = client.method(method)
                .uri(path)
                .headers(headers -> defaultHeaders.forEach(headers::set));
        if (body != null) {
            request = request.contentType(MediaType.APPLICATION_JSON).body(body);
        }
        lastResponse = request.retrieve().toEntity(String.class);
        lastResponseBytes = null;
        return lastResponse;
    }
}

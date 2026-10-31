package cz.novanadeje.app.cucumber;

import cz.novanadeje.app.cucumber.transcript.ApiTranscriptRecorder;
import cz.novanadeje.app.cucumber.transcript.RecordedExchange;
import cz.novanadeje.app.cucumber.transcript.ScenarioTranscript;
import cz.novanadeje.app.support.AsyncTaskTracker;
import io.cucumber.spring.ScenarioScope;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.JsonNodeFactory;
import tools.jackson.databind.node.ObjectNode;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

@Component
@ScenarioScope
public class ApiClient {

    private static final String FORWARDED_FOR = "X-Forwarded-For";
    private static final AtomicInteger CLIENT_ADDRESSES = new AtomicInteger();
    private static final int RAW_READ_TIMEOUT_MILLIS = 10_000;

    private final RestClient client;
    private final int port;
    private final ApiTranscriptRecorder transcript;
    private final AsyncTaskTracker asyncTasks;
    private final JsonMapper jsonMapper = JsonMapper.builder().build();
    private final Map<String, String> defaultHeaders = new LinkedHashMap<>();
    private ResponseEntity<String> lastResponse;
    private byte[] lastResponseBytes;
    private String clientAddress = nextClientAddress();

    public ApiClient(@LocalServerPort int port, ApiTranscriptRecorder transcript, AsyncTaskTracker asyncTasks) {
        this.port = port;
        this.transcript = transcript;
        this.asyncTasks = asyncTasks;
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

    public ResponseEntity<String> put(String path, Map<String, ?> body) {
        return exchange(HttpMethod.PUT, path, body);
    }

    public ResponseEntity<String> postFile(String path, String fieldName, String fileName, String contentType, byte[] bytes) {
        HttpHeaders partHeaders = new HttpHeaders();
        partHeaders.setContentType(MediaType.parseMediaType(contentType));
        MultiValueMap<String, Object> parts = new LinkedMultiValueMap<>();
        parts.add(fieldName, new HttpEntity<>(new ByteArrayResource(bytes) {
            @Override
            public String getFilename() {
                return fileName;
            }
        }, partHeaders));
        lastResponse = client.post()
                .uri(path)
                .headers(this::addDefaultHeaders)
                .contentType(MediaType.MULTIPART_FORM_DATA)
                .body(parts)
                .retrieve()
                .toEntity(String.class);
        lastResponseBytes = null;
        ObjectNode file = JsonNodeFactory.instance.objectNode().put("fileName", fileName).put("contentType", contentType)
                .put("size", bytes.length).put("sha256", ScenarioTranscript.sha256(bytes));
        record("POST", path, Map.of(), JsonNodeFactory.instance.objectNode().set(fieldName, file));
        return lastResponse;
    }

    public ResponseEntity<String> putBytes(String path, byte[] bytes, Map<String, String> headers) {
        lastResponse = client.put()
                .uri(path)
                .headers(this::addDefaultHeaders)
                .headers(sent -> headers.forEach(sent::set))
                .contentType(MediaType.APPLICATION_OCTET_STREAM)
                .body(bytes)
                .retrieve()
                .toEntity(String.class);
        lastResponseBytes = null;
        record("PUT", path, headers, JsonNodeFactory.instance.objectNode().put("size", bytes.length).put("sha256", ScenarioTranscript.sha256(bytes)));
        return lastResponse;
    }

    public ResponseEntity<String> postForm(String path, Map<String, String> fields) {
        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        fields.forEach((name, value) -> {
            if (value != null) {
                form.add(name, value);
            }
        });
        lastResponse = client.post()
                .uri(path)
                .headers(this::addDefaultHeaders)
                .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .body(form)
                .retrieve()
                .toEntity(String.class);
        lastResponseBytes = null;
        ObjectNode fieldsSent = JsonNodeFactory.instance.objectNode();
        form.forEach((name, values) -> fieldsSent.put(name, String.join(",", values)));
        record("POST", path, Map.of(), fieldsSent);
        return lastResponse;
    }

    public ResponseEntity<String> get(String path) {
        return exchange(HttpMethod.GET, path, null);
    }

    public ResponseEntity<String> delete(String path) {
        return exchange(HttpMethod.DELETE, path, null);
    }

    public ResponseEntity<byte[]> getBytes(String path) {
        ResponseEntity<byte[]> response = client.get()
                .uri(path)
                .headers(this::addDefaultHeaders)
                .retrieve()
                .toEntity(byte[].class);
        lastResponseBytes = response.getBody() == null ? new byte[0] : response.getBody();
        lastResponse = ResponseEntity.status(response.getStatusCode())
                .headers(response.getHeaders())
                .body(new String(lastResponseBytes, StandardCharsets.UTF_8));
        completeExchange("GET", path, Map.of(), null, response.getStatusCode().value(), response.getHeaders(), lastResponseBytes);
        return response;
    }

    public ResponseEntity<String> postRaw(String path, String json, Map<String, String> headers) {
        byte[] body = json.getBytes(StandardCharsets.UTF_8);
        StringBuilder request = new StringBuilder("POST " + path + " HTTP/1.1\r\n");
        Map<String, String> sent = new LinkedHashMap<>(headers);
        sent.putIfAbsent(FORWARDED_FOR, clientAddress);
        sent.forEach((name, value) -> request.append(name).append(": ").append(value).append("\r\n"));
        if (sent.keySet().stream().noneMatch(HttpHeaders.CONTENT_TYPE::equalsIgnoreCase)) {
            request.append("Content-Type: application/json\r\n");
        }
        request.append("Content-Length: ").append(body.length).append("\r\n")
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
            completeExchange("POST", path, sent, rawBody(json), status, rawHeaders(raw, bodyStart), lastResponse.getBody().getBytes(StandardCharsets.UTF_8));
            return lastResponse;
        } catch (IOException unreachable) {
            throw new IllegalStateException("The raw request to " + path + " failed", unreachable);
        }
    }

    public ResponseEntity<String> sendRaw(String method, String target, Map<String, String> headers, String body) {
        byte[] content = body.getBytes(StandardCharsets.ISO_8859_1);
        Map<String, String> sent = new LinkedHashMap<>(headers);
        sent.putIfAbsent(FORWARDED_FOR, clientAddress);
        StringBuilder request = new StringBuilder(method + " " + target + " HTTP/1.1\r\n");
        sent.forEach((name, value) -> request.append(name).append(": ").append(value).append("\r\n"));
        if (content.length > 0) {
            request.append("Content-Length: ").append(content.length).append("\r\n");
        }
        request.append("Connection: close\r\n\r\n");
        try (Socket socket = new Socket("localhost", port)) {
            socket.setSoTimeout(RAW_READ_TIMEOUT_MILLIS);
            OutputStream out = socket.getOutputStream();
            out.write(request.toString().getBytes(StandardCharsets.ISO_8859_1));
            out.write(content);
            out.flush();
            String raw = new String(socket.getInputStream().readAllBytes(), StandardCharsets.ISO_8859_1);
            int status = Integer.parseInt(raw.split(" ", 3)[1]);
            int bodyStart = raw.indexOf("\r\n\r\n");
            HttpHeaders responseHeaders = rawHeaders(raw, bodyStart);
            String rawBody = bodyStart < 0 ? "" : raw.substring(bodyStart + 4);
            if ("chunked".equalsIgnoreCase(responseHeaders.getFirst(HttpHeaders.TRANSFER_ENCODING))) {
                rawBody = unchunked(rawBody);
            }
            String responseBody = new String(rawBody.getBytes(StandardCharsets.ISO_8859_1), StandardCharsets.UTF_8);
            lastResponse = ResponseEntity.status(status).headers(responseHeaders).body(responseBody);
            lastResponseBytes = null;
            completeExchange(method, target, sent, content.length > 0 ? JsonNodeFactory.instance.stringNode(body) : null, status, responseHeaders,
                    responseBody.getBytes(StandardCharsets.UTF_8));
            return lastResponse;
        } catch (IOException unreachable) {
            throw new IllegalStateException("The raw request to " + target + " failed", unreachable);
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

    public void comeFromAnotherAddress() {
        clientAddress = nextClientAddress();
    }

    public void comeFrom(String address) {
        clientAddress = address;
    }

    public void comeFromPublicAddress() {
        clientAddress = "203.0.113." + (CLIENT_ADDRESSES.incrementAndGet() & 0xff);
    }

    public void sendHeader(String name, String value) {
        defaultHeaders.put(name, value);
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
                .headers(this::addDefaultHeaders);
        if (body != null) {
            request = request.contentType(MediaType.APPLICATION_JSON).body(body);
        }
        lastResponse = request.retrieve().toEntity(String.class);
        lastResponseBytes = null;
        record(method.name(), path, Map.of(), body == null ? null : jsonMapper.valueToTree(body));
        return lastResponse;
    }

    private void record(String method, String path, Map<String, String> extraHeaders, JsonNode requestBody) {
        String body = lastResponse.getBody();
        completeExchange(method, path, extraHeaders, requestBody, lastResponse.getStatusCode().value(), lastResponse.getHeaders(),
                body == null ? new byte[0] : body.getBytes(StandardCharsets.UTF_8));
    }

    private void completeExchange(String method, String path, Map<String, String> extraHeaders, JsonNode requestBody, int status, HttpHeaders responseHeaders,
                             byte[] responseBody) {
        asyncTasks.awaitIdleAfter(method + " " + path);
        Map<String, String> sent = new LinkedHashMap<>(defaultHeaders);
        sent.putAll(extraHeaders);
        transcript.exchange(new RecordedExchange(method, path, sent, requestBody, status, responseHeaders, responseBody));
    }

    private JsonNode rawBody(String json) {
        try {
            return jsonMapper.readTree(json);
        } catch (RuntimeException notJson) {
            return JsonNodeFactory.instance.stringNode(json);
        }
    }

    static String unchunked(String chunked) {
        StringBuilder body = new StringBuilder();
        int at = 0;
        while (at < chunked.length()) {
            int sizeEnd = chunked.indexOf("\r\n", at);
            int size = Integer.parseInt(chunked.substring(at, sizeEnd).split(";", 2)[0].strip(), 16);
            if (size == 0) {
                break;
            }
            body.append(chunked, sizeEnd + 2, sizeEnd + 2 + size);
            at = sizeEnd + 2 + size + 2;
        }
        return body.toString();
    }

    static HttpHeaders rawHeaders(String raw, int bodyStart) {
        HttpHeaders headers = new HttpHeaders();
        String head = bodyStart < 0 ? raw : raw.substring(0, bodyStart);
        head.lines().skip(1).forEach(line -> {
            int colon = line.indexOf(':');
            if (colon > 0) {
                headers.add(line.substring(0, colon).trim().toLowerCase(Locale.ROOT), line.substring(colon + 1).trim());
            }
        });
        return headers;
    }

    private void addDefaultHeaders(HttpHeaders headers) {
        defaultHeaders.forEach(headers::set);
        headers.set(FORWARDED_FOR, clientAddress);
    }

    private static String nextClientAddress() {
        int client = CLIENT_ADDRESSES.incrementAndGet();
        return "10." + (client >> 16 & 0xff) + "." + (client >> 8 & 0xff) + "." + (client & 0xff);
    }
}

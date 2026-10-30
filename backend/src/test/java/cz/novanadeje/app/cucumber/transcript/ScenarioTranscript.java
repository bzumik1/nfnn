package cz.novanadeje.app.cucumber.transcript;

import cz.novanadeje.app.support.MailContents;
import jakarta.mail.Address;
import jakarta.mail.BodyPart;
import jakarta.mail.Message;
import jakarta.mail.MessagingException;
import jakarta.mail.Multipart;
import jakarta.mail.Part;
import jakarta.mail.internet.InternetAddress;
import jakarta.mail.internet.MimeMessage;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.web.util.HtmlUtils;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.JsonNodeFactory;
import tools.jackson.databind.node.ObjectNode;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.function.BiFunction;
import java.util.regex.Pattern;
import java.util.stream.IntStream;

public final class ScenarioTranscript {

    private static final JsonNodeFactory NODES = JsonNodeFactory.instance;
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final Set<String> REQUEST_HEADERS = Set.of("authorization", "accept", "accept-language", "cookie", "if-match", "if-none-match",
            "origin", "x-nfnn-direct", "content-type");
    private static final Set<String> VOLATILE_RESPONSE_HEADERS = Set.of("date", "content-length", "keep-alive", "connection", "transfer-encoding");
    private static final Pattern COOKIE_VALUE = Pattern.compile("^([^=;]+)=[^;]*");
    private static final Pattern COOKIE_EXPIRES = Pattern.compile("(?i)(;\\s*Expires=)[^;]*");
    private static final Pattern ANY_ID = Pattern.compile("(?i)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}");
    private static final String ERRORS = "errors";
    private static final String ROOT = "$";
    private static final Pattern SPACES_AND_HYPHENS = Pattern.compile("[\\s-]+");
    private static final int LEAK_CHECK_MINIMUM_LENGTH = 8;
    private static final Pattern HEAD = Pattern.compile("(?is)<(head|style|script)\\b.*?</\\1>|<!--.*?-->");
    private static final Pattern TAG = Pattern.compile("(?s)<[^>]*>");
    private static final Pattern HREF = Pattern.compile("(?i)\\bhref\\s*=\\s*\"([^\"]*)\"");
    private static final Pattern WHITESPACE = Pattern.compile("[\\s\\u00a0]+");
    private static final String INSTANT_SUFFIX = "At";
    private static final Pattern REQUEST_COOKIE_VALUE = Pattern.compile("([^=;\\s]+)=[^;]*");

    private static final Set<String> MACHINE_DEPENDENT_BODIES = Set.of("GET /api/admin/operations/diagnostics", "GET /api/admin/operations/diagnostics/threads");
    private static final Map<String, Set<String>> FILE_TIME_FIELDS = Map.of(
            "GET /api/admin/operations/logs", Set.of("changedAt"),
            "GET /api/admin/operations/backups", Set.of("changedAt"));
    private static final String FILE_TIME = "<file-time>";
    private static final String APPLICATION_PACKAGE = "cz.novanadeje.app.";
    private static final Pattern NUMBERED_LABEL = Pattern.compile("<([a-z-]+):\\d+>");

    private final List<UnorderedTie> unorderedTies;
    private final List<RecordedExchange> exchanges = new ArrayList<>();
    private final List<MimeMessage> mails = new ArrayList<>();
    private final List<RecordedLogLine> logs = new ArrayList<>();

    public ScenarioTranscript() {
        this(UnorderedTie.V2);
    }

    public ScenarioTranscript(List<UnorderedTie> unorderedTies) {
        this.unorderedTies = List.copyOf(unorderedTies);
    }

    public void exchange(RecordedExchange exchange) {
        exchanges.add(exchange);
    }

    public void mails(List<MimeMessage> sent) {
        mails.addAll(sent);
    }

    public void logs(List<RecordedLogLine> lines) {
        logs.addAll(lines);
    }

    public boolean isEmpty() {
        return exchanges.isEmpty() && mails.isEmpty() && logs.isEmpty();
    }

    public JsonNode toJson(Map<String, String> knownValues) {
        TranscriptNormaliser normaliser = new TranscriptNormaliser(knownValues);
        ObjectNode transcript = NODES.objectNode();
        ObjectNode requests = transcript.putObject("requests");
        Map<String, Integer> ordinals = new HashMap<>();
        for (RecordedExchange exchange : exchanges) {
            String template = exchange.method() + " " + TranscriptNormaliser.template(exchange.uri());
            int ordinal = ordinals.merge(template, 1, Integer::sum);
            requests.set(template + " #" + ordinal, call(template, exchange, normaliser));
        }
        transcript.set("mails", described(inSettledOrder(mails, knownValues, ScenarioTranscript::mail), normaliser, ScenarioTranscript::mail));
        transcript.set("logs", described(inSettledOrder(logs, knownValues, ScenarioTranscript::logLine), normaliser, ScenarioTranscript::logLine));
        refuseMaskedValuesLeft(JSON.writeValueAsString(transcript), normaliser.maskedValues());
        return transcript;
    }

    private static void refuseMaskedValuesLeft(String written, Set<String> maskedValues) {
        for (String masked : maskedValues) {
            String compacted = SPACES_AND_HYPHENS.matcher(masked).replaceAll("");
            String escaped = JSON.writeValueAsString(masked);
            List<String> forms = List.of(masked, URLEncoder.encode(masked, StandardCharsets.UTF_8), escaped.substring(1, escaped.length() - 1),
                    compacted.length() >= masked.length() || compacted.length() < LEAK_CHECK_MINIMUM_LENGTH ? masked : compacted);
            if (forms.stream().anyMatch(written::contains)) {
                throw new IllegalStateException("A value of " + masked.length() + " characters that the transcript masks is still in it, "
                        + "raw, URL-encoded, JSON-escaped or without spaces and hyphens; extend the masking in TranscriptNormaliser before recording");
            }
        }
    }

    private ObjectNode call(String template, RecordedExchange exchange, TranscriptNormaliser normaliser) {
        ObjectNode call = NODES.objectNode();
        ObjectNode request = call.putObject("request");
        request.put("path", normaliser.path(exchange.uri()));
        ObjectNode requestHeaders = NODES.objectNode();
        new TreeMap<>(exchange.requestHeaders()).forEach((name, value) -> {
            if (REQUEST_HEADERS.contains(name.toLowerCase(Locale.ROOT))) {
                requestHeaders.put(name, "cookie".equalsIgnoreCase(name) ? normaliser.text(REQUEST_COOKIE_VALUE.matcher(value).replaceAll("$1=" + TranscriptNormaliser.SECRET))
                        : normaliser.text(value));
            }
        });
        if (!requestHeaders.isEmpty()) {
            request.set("headers", requestHeaders);
        }
        if (exchange.requestBody() != null) {
            request.set("body", normaliser.json(sortedFields(exchange.requestBody())));
        }
        ObjectNode response = call.putObject("response");
        response.put("status", exchange.status());
        ObjectNode responseHeaders = NODES.objectNode();
        Map<String, List<String>> sortedHeaders = new TreeMap<>(String.CASE_INSENSITIVE_ORDER);
        exchange.responseHeaders().forEach(sortedHeaders::put);
        sortedHeaders.forEach((name, values) -> {
            if (!VOLATILE_RESPONSE_HEADERS.contains(name.toLowerCase(Locale.ROOT))) {
                List<String> normalisedValues = values.stream().map(value -> normaliser.text("set-cookie".equalsIgnoreCase(name)
                        ? COOKIE_EXPIRES.matcher(COOKIE_VALUE.matcher(value).replaceFirst("$1=" + TranscriptNormaliser.SECRET)).replaceAll("$1<time>") : value)).toList();
                if (normalisedValues.size() == 1) {
                    responseHeaders.put(name, normalisedValues.getFirst());
                } else {
                    ArrayNode several = responseHeaders.putArray(name);
                    normalisedValues.forEach(several::add);
                }
            }
        });
        response.set("headers", responseHeaders);
        JsonNode body = body(template, exchange, normaliser);
        if (body != null) {
            response.set("body", machineIndependent(template, body));
        }
        return call;
    }

    private static JsonNode machineIndependent(String template, JsonNode body) {
        if (MACHINE_DEPENDENT_BODIES.contains(template)) {
            return shape(body);
        }
        Set<String> fileTimes = FILE_TIME_FIELDS.get(template);
        return fileTimes == null ? body : withFileTimesMasked(body, fileTimes);
    }

    private static JsonNode shape(JsonNode node) {
        if (node.isObject()) {
            ObjectNode shape = NODES.objectNode();
            node.properties().forEach(field -> shape.set(field.getKey(), shape(field.getValue())));
            return shape;
        }
        if (node.isArray()) {
            ArrayNode shape = NODES.arrayNode();
            if (!node.isEmpty()) {
                shape.add(shape(node.get(0)));
            }
            return shape;
        }
        if (node.isNull()) {
            return node;
        }
        return NODES.stringNode(node.isNumber() ? "<number>" : node.isBoolean() ? "<boolean>" : "<string>");
    }

    private static JsonNode withFileTimesMasked(JsonNode node, Set<String> fields) {
        if (node.isObject()) {
            ObjectNode masked = NODES.objectNode();
            node.properties().forEach(field -> masked.set(field.getKey(), fields.contains(field.getKey()) && !field.getValue().isNull()
                    ? NODES.stringNode(FILE_TIME) : withFileTimesMasked(field.getValue(), fields)));
            return masked;
        }
        if (node.isArray()) {
            ArrayNode masked = NODES.arrayNode();
            node.values().forEach(element -> masked.add(withFileTimesMasked(element, fields)));
            return masked;
        }
        return node;
    }

    private static JsonNode sortedFields(JsonNode node) {
        if (node.isObject()) {
            ObjectNode sorted = NODES.objectNode();
            Map<String, JsonNode> fields = new TreeMap<>();
            node.properties().forEach(field -> fields.put(field.getKey(), field.getValue()));
            fields.forEach((name, value) -> sorted.set(name, sortedFields(value)));
            return sorted;
        }
        if (node.isArray()) {
            ArrayNode sorted = NODES.arrayNode();
            node.values().forEach(element -> sorted.add(sortedFields(element)));
            return sorted;
        }
        return node;
    }

    private JsonNode body(String template, RecordedExchange exchange, TranscriptNormaliser normaliser) {
        byte[] bytes = exchange.responseBody();
        if (bytes == null || bytes.length == 0) {
            return null;
        }
        MediaType type = contentType(exchange.responseHeaders());
        if (isJson(type)) {
            try {
                return normaliser.json(settled(template, sortedFields(JSON.readTree(bytes)), ROOT));
            } catch (RuntimeException notJson) {
                return NODES.stringNode(normaliser.text(new String(bytes, StandardCharsets.UTF_8)));
            }
        }
        if (type != null && MediaType.APPLICATION_PDF.isCompatibleWith(type)) {
            return pdf(bytes, normaliser);
        }
        if (type == null || "text".equals(type.getType()) || type.getSubtype().endsWith("xml")) {
            return NODES.stringNode(normaliser.text(new String(bytes, StandardCharsets.UTF_8)));
        }
        return binary(bytes);
    }

    private JsonNode settled(String template, JsonNode node, String path) {
        if (node.isObject()) {
            ObjectNode settled = NODES.objectNode();
            node.properties().forEach(field -> {
                JsonNode value = settled(template, field.getValue(), path + "." + field.getKey());
                settled.set(field.getKey(), ERRORS.equals(field.getKey()) && value.isArray() ? sortedByContent(value) : value);
            });
            return settled;
        }
        if (node.isArray()) {
            List<JsonNode> elements = new ArrayList<>();
            node.values().forEach(element -> elements.add(settled(template, element, path + "[]")));
            return isUnordered(template, path) ? withTiesSorted(elements) : NODES.arrayNode().addAll(elements);
        }
        return node;
    }

    private boolean isUnordered(String template, String path) {
        return unorderedTies.stream().anyMatch(tie -> tie.request().equals(template) && tie.path().equals(path));
    }

    private static ArrayNode withTiesSorted(List<JsonNode> elements) {
        ArrayNode settled = NODES.arrayNode();
        int start = 0;
        while (start < elements.size()) {
            int end = start + 1;
            Map<String, JsonNode> stamp = instants(elements.get(start));
            while (end < elements.size() && !stamp.isEmpty() && stamp.equals(instants(elements.get(end)))) {
                end++;
            }
            elements.subList(start, end).stream().sorted(Comparator.comparing(ScenarioTranscript::contentKey)).forEach(settled::add);
            start = end;
        }
        return settled;
    }

    private static Map<String, JsonNode> instants(JsonNode element) {
        Map<String, JsonNode> instants = new TreeMap<>();
        if (element.isObject()) {
            element.properties().stream()
                    .filter(field -> field.getKey().endsWith(INSTANT_SUFFIX) && field.getValue().isString())
                    .forEach(field -> instants.put(field.getKey(), field.getValue()));
        }
        return instants;
    }

    private static ArrayNode sortedByContent(JsonNode array) {
        ArrayNode sorted = NODES.arrayNode();
        array.valueStream().map(ScenarioTranscript::sortedFields).sorted(Comparator.comparing(ScenarioTranscript::contentKey)).forEach(sorted::add);
        return sorted;
    }

    private static String contentKey(JsonNode node) {
        return ANY_ID.matcher(JSON.writeValueAsString(node)).replaceAll("<id>");
    }

    private static boolean isJson(MediaType type) {
        return type != null && (type.getSubtype().equals("json") || type.getSubtype().endsWith("+json"));
    }

    private static MediaType contentType(HttpHeaders headers) {
        try {
            return headers.getContentType();
        } catch (RuntimeException unparsable) {
            return null;
        }
    }

    private static ObjectNode pdf(byte[] bytes, TranscriptNormaliser normaliser) {
        ObjectNode pdf = NODES.objectNode();
        try (PDDocument document = Loader.loadPDF(bytes)) {
            pdf.put("pages", document.getNumberOfPages());
            ArrayNode texts = pdf.putArray("text");
            for (int page = 1; page <= document.getNumberOfPages(); page++) {
                PDFTextStripper stripper = new PDFTextStripper();
                stripper.setStartPage(page);
                stripper.setEndPage(page);
                texts.add(normaliser.text(stripper.getText(document).replace(' ', ' ').strip()));
            }
        } catch (IOException unreadable) {
            pdf.put("unreadable", unreadable.getClass().getSimpleName());
        }
        return pdf;
    }

    private static ObjectNode binary(byte[] bytes) {
        ObjectNode binary = NODES.objectNode();
        binary.put("size", bytes.length);
        binary.put("sha256", sha256(bytes));
        return binary;
    }

    private static JsonNode mail(MimeMessage sent, TranscriptNormaliser normaliser) {
        try {
            MimeMessage received = MailContents.asReceived(sent);
            ObjectNode mail = NODES.objectNode();
            mail.set("from", addresses(received.getFrom(), normaliser));
            mail.set("to", addresses(received.getRecipients(Message.RecipientType.TO), normaliser));
            putIfPresent(mail, "cc", addresses(received.getRecipients(Message.RecipientType.CC), normaliser));
            putIfPresent(mail, "bcc", addresses(received.getRecipients(Message.RecipientType.BCC), normaliser));
            putIfPresent(mail, "replyTo", addresses(received.getReplyTo(), normaliser));
            mail.put("subject", normaliser.text(received.getSubject()));
            Map<String, List<Part>> parts = new LinkedHashMap<>();
            collect(received, parts);
            parts.getOrDefault("text/plain", List.of()).stream().findFirst()
                    .ifPresent(text -> mail.put("text", normaliser.text(content(text).replace("\r\n", "\n"))));
            parts.getOrDefault("text/html", List.of()).stream().findFirst()
                    .ifPresent(html -> mail.set("html", html(content(html).replace("\r\n", "\n"), normaliser)));
            ArrayNode attachments = NODES.arrayNode();
            for (Part attachment : parts.getOrDefault("attachment", List.of())) {
                ObjectNode described = NODES.objectNode();
                described.put("fileName", normaliser.text(attachment.getFileName()));
                described.put("contentType", attachment.getContentType().split(";")[0].trim().toLowerCase(Locale.ROOT));
                byte[] bytes = bytes(attachment);
                if (attachment.isMimeType("application/pdf")) {
                    described.set("pdf", pdf(bytes, normaliser));
                } else if (attachment.isMimeType("text/*")) {
                    described.put("text", normaliser.text(new String(bytes, StandardCharsets.UTF_8).replace("\r\n", "\n")));
                } else {
                    described.setAll(binary(bytes));
                }
                attachments.add(described);
            }
            putIfPresent(mail, "attachments", attachments);
            return mail;
        } catch (MessagingException | IOException unreadable) {
            throw new IllegalStateException("A recorded e-mail cannot be read", unreadable);
        }
    }

    private static ObjectNode html(String html, TranscriptNormaliser normaliser) {
        ObjectNode described = NODES.objectNode();
        String visible = HtmlUtils.htmlUnescape(TAG.matcher(HEAD.matcher(html).replaceAll(" ")).replaceAll(" "));
        described.put("text", normaliser.text(WHITESPACE.matcher(visible).replaceAll(" ").strip()));
        ArrayNode links = described.putArray("links");
        HREF.matcher(html).results().map(link -> normaliser.text(HtmlUtils.htmlUnescape(link.group(1)))).forEach(links::add);
        described.put("sha256", sha256(normaliser.text(html).getBytes(StandardCharsets.UTF_8)));
        return described;
    }

    private static void collect(Part part, Map<String, List<Part>> parts) throws MessagingException, IOException {
        if (part.isMimeType("multipart/*")) {
            Multipart multipart = (Multipart) part.getContent();
            for (int index = 0; index < multipart.getCount(); index++) {
                BodyPart child = multipart.getBodyPart(index);
                collect(child, parts);
            }
        } else if (Part.ATTACHMENT.equalsIgnoreCase(part.getDisposition()) || part.getFileName() != null) {
            parts.computeIfAbsent("attachment", ignored -> new ArrayList<>()).add(part);
        } else if (part.isMimeType("text/plain")) {
            parts.computeIfAbsent("text/plain", ignored -> new ArrayList<>()).add(part);
        } else if (part.isMimeType("text/html")) {
            parts.computeIfAbsent("text/html", ignored -> new ArrayList<>()).add(part);
        } else {
            parts.computeIfAbsent("attachment", ignored -> new ArrayList<>()).add(part);
        }
    }

    private static String content(Part part) {
        try {
            return part.getContent().toString();
        } catch (MessagingException | IOException unreadable) {
            throw new IllegalStateException("A recorded e-mail part cannot be read", unreadable);
        }
    }

    private static byte[] bytes(Part part) throws MessagingException, IOException {
        try (InputStream in = part.getInputStream(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            in.transferTo(out);
            return out.toByteArray();
        }
    }

    private static ArrayNode addresses(Address[] addresses, TranscriptNormaliser normaliser) {
        ArrayNode list = NODES.arrayNode();
        if (addresses != null) {
            Arrays.stream(addresses).map(address -> address instanceof InternetAddress internet ? internet.toUnicodeString() : address.toString()).map(normaliser::text).forEach(list::add);
        }
        return list;
    }

    private static void putIfPresent(ObjectNode target, String name, ArrayNode values) {
        if (!values.isEmpty()) {
            target.set(name, values);
        }
    }

    private static JsonNode logLine(RecordedLogLine line, TranscriptNormaliser normaliser) {
        String logger = line.logger().startsWith(APPLICATION_PACKAGE) ? line.logger().substring(APPLICATION_PACKAGE.length()) : line.logger();
        String exception = line.exception() == null || line.exception().isEmpty() ? "" : " [" + line.exception() + "]";
        return NODES.stringNode(line.level() + " " + logger + ": " + normaliser.text(line.message()) + exception);
    }

    private static <T> List<T> inSettledOrder(List<T> items, Map<String, String> knownValues, BiFunction<T, TranscriptNormaliser, JsonNode> describe) {
        List<String> keys = items.stream()
                .map(item -> NUMBERED_LABEL.matcher(JSON.writeValueAsString(describe.apply(item, new TranscriptNormaliser(knownValues)))).replaceAll("<$1>"))
                .toList();
        return IntStream.range(0, items.size()).boxed().sorted(Comparator.comparing(keys::get)).map(items::get).toList();
    }

    private static <T> ArrayNode described(List<T> items, TranscriptNormaliser normaliser, BiFunction<T, TranscriptNormaliser, JsonNode> describe) {
        ArrayNode described = NODES.arrayNode();
        items.forEach(item -> described.add(describe.apply(item, normaliser)));
        return described;
    }

    public static String sha256(byte[] bytes) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (NoSuchAlgorithmException missing) {
            throw new IllegalStateException("SHA-256 is missing", missing);
        }
    }
}

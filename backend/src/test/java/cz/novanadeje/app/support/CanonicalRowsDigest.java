package cz.novanadeje.app.support;

import tools.jackson.databind.JsonNode;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;

public final class CanonicalRowsDigest {

    private CanonicalRowsDigest() {
    }

    public static String sha256(JsonNode rows) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(canonical(rows).getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException missing) {
            throw new IllegalStateException("SHA-256 is not available", missing);
        }
    }

    public static String canonical(JsonNode node) {
        StringBuilder text = new StringBuilder();
        write(node, text);
        return text.toString();
    }

    private static void write(JsonNode node, StringBuilder text) {
        if (node.isNull()) {
            text.append("null");
        } else if (node.isBoolean()) {
            text.append(node.asBoolean());
        } else if (node.isIntegralNumber()) {
            text.append(node.bigIntegerValue());
        } else if (node.isNumber()) {
            throw new IllegalArgumentException("The canonical rows hold integers only, not " + node);
        } else if (node.isString()) {
            string(node.asString(), text);
        } else if (node.isArray()) {
            text.append('[');
            List<JsonNode> elements = node.valueStream().toList();
            for (int index = 0; index < elements.size(); index++) {
                text.append(index == 0 ? "" : ",");
                write(elements.get(index), text);
            }
            text.append(']');
        } else {
            text.append('{');
            List<Map.Entry<String, JsonNode>> members = node.properties().stream().sorted(Map.Entry.comparingByKey()).toList();
            for (int index = 0; index < members.size(); index++) {
                text.append(index == 0 ? "" : ",");
                string(members.get(index).getKey(), text);
                text.append(':');
                write(members.get(index).getValue(), text);
            }
            text.append('}');
        }
    }

    private static void string(String value, StringBuilder text) {
        text.append('"');
        for (char character : value.toCharArray()) {
            switch (character) {
                case '"' -> text.append("\\\"");
                case '\\' -> text.append("\\\\");
                case '\b' -> text.append("\\b");
                case '\f' -> text.append("\\f");
                case '\n' -> text.append("\\n");
                case '\r' -> text.append("\\r");
                case '\t' -> text.append("\\t");
                default -> text.append(character < 0x20 ? String.format("\\u%04x", (int) character) : String.valueOf(character));
            }
        }
        text.append('"');
    }
}

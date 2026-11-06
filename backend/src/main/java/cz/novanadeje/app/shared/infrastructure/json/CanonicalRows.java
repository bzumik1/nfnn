package cz.novanadeje.app.shared.infrastructure.json;

import tools.jackson.databind.JsonNode;

import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;

public final class CanonicalRows {

    private static final char FIRST_PRINTABLE = 0x20;
    private static final BigInteger LARGEST_SAFE_INTEGER = BigInteger.valueOf(9_007_199_254_740_991L);

    private CanonicalRows() {
    }

    public static String sha256(JsonNode rows) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(canonical(rows).getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException missing) {
            throw new IllegalStateException("SHA-256 is not available", missing);
        }
    }

    public static String canonical(JsonNode rows) {
        StringBuilder text = new StringBuilder();
        write(rows, text);
        return text.toString();
    }

    private static void write(JsonNode node, StringBuilder text) {
        if (node.isNull()) {
            text.append("null");
        } else if (node.isBoolean()) {
            text.append(node.booleanValue());
        } else if (node.isIntegralNumber()) {
            text.append(safeInteger(node.bigIntegerValue()));
        } else if (node.isNumber()) {
            throw new IllegalStateException("Sync rows hold integers only");
        } else if (node.isString()) {
            string(node.stringValue(), text);
        } else if (node.isArray()) {
            text.append('[');
            for (int index = 0; index < node.size(); index++) {
                if (index > 0) {
                    text.append(',');
                }
                write(node.get(index), text);
            }
            text.append(']');
        } else if (node.isObject()) {
            text.append('{');
            List<Map.Entry<String, JsonNode>> members = node.properties().stream().sorted(Map.Entry.comparingByKey()).toList();
            for (int index = 0; index < members.size(); index++) {
                if (index > 0) {
                    text.append(',');
                }
                string(members.get(index).getKey(), text);
                text.append(':');
                write(members.get(index).getValue(), text);
            }
            text.append('}');
        } else {
            throw new IllegalStateException("Sync rows hold JSON values only");
        }
    }

    private static BigInteger safeInteger(BigInteger value) {
        if (value.abs().compareTo(LARGEST_SAFE_INTEGER) > 0) {
            throw new IllegalStateException("Sync rows hold integers within the safe range of a JavaScript number only");
        }
        return value;
    }

    private static void string(String value, StringBuilder text) {
        text.append('"');
        if (isPlain(value)) {
            text.append(value).append('"');
            return;
        }
        for (int index = 0; index < value.length(); index++) {
            char character = value.charAt(index);
            switch (character) {
                case '"' -> text.append("\\\"");
                case '\\' -> text.append("\\\\");
                case '\b' -> text.append("\\b");
                case '\f' -> text.append("\\f");
                case '\n' -> text.append("\\n");
                case '\r' -> text.append("\\r");
                case '\t' -> text.append("\\t");
                default -> {
                    if (character < FIRST_PRINTABLE || isLoneSurrogate(value, index)) {
                        text.append(String.format("\\u%04x", (int) character));
                    } else {
                        text.append(character);
                    }
                }
            }
        }
        text.append('"');
    }

    private static boolean isPlain(String value) {
        for (int index = 0; index < value.length(); index++) {
            char character = value.charAt(index);
            if (character < FIRST_PRINTABLE || character == '"' || character == '\\' || Character.isSurrogate(character)) {
                return false;
            }
        }
        return true;
    }

    private static boolean isLoneSurrogate(String value, int index) {
        char character = value.charAt(index);
        if (Character.isHighSurrogate(character)) {
            return index + 1 >= value.length() || !Character.isLowSurrogate(value.charAt(index + 1));
        }
        return Character.isLowSurrogate(character) && (index == 0 || !Character.isHighSurrogate(value.charAt(index - 1)));
    }
}

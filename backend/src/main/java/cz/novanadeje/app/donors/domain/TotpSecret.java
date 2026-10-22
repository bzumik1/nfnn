package cz.novanadeje.app.donors.domain;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.regex.Pattern;

public record TotpSecret(String value) {

    public static final int LENGTH = 32;
    private static final int BYTES = 20;
    private static final String ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    private static final Pattern SHAPE = Pattern.compile("^[A-Z2-7]{" + LENGTH + "}$");
    private static final SecureRandom RANDOM = new SecureRandom();

    public TotpSecret {
        if (value == null || !SHAPE.matcher(value).matches()) {
            throw new IllegalArgumentException("A TOTP secret is " + LENGTH + " base32 characters");
        }
    }

    public static TotpSecret generate() {
        byte[] bytes = new byte[BYTES];
        RANDOM.nextBytes(bytes);
        return new TotpSecret(encode(bytes));
    }

    public byte[] bytes() {
        byte[] bytes = new byte[BYTES];
        int buffer = 0;
        int bits = 0;
        int index = 0;
        for (char letter : value.toCharArray()) {
            buffer = buffer << 5 | ALPHABET.indexOf(letter);
            bits += 5;
            if (bits >= 8) {
                bytes[index++] = (byte) (buffer >> bits - 8);
                bits -= 8;
            }
        }
        return bytes;
    }

    public String otpauthUri(String issuer, String accountName) {
        String label = encode(issuer) + ":" + encode(accountName);
        return "otpauth://totp/" + label + "?secret=" + value + "&issuer=" + encode(issuer) + "&algorithm=SHA1&digits=6&period=30";
    }

    @Override
    public String toString() {
        return "TotpSecret[***]";
    }

    private static String encode(byte[] bytes) {
        StringBuilder letters = new StringBuilder(LENGTH);
        int buffer = 0;
        int bits = 0;
        for (byte b : bytes) {
            buffer = buffer << 8 | b & 0xff;
            bits += 8;
            while (bits >= 5) {
                letters.append(ALPHABET.charAt(buffer >> bits - 5 & 0x1f));
                bits -= 5;
            }
        }
        return letters.toString();
    }

    private static String encode(String text) {
        return URLEncoder.encode(text, StandardCharsets.UTF_8).replace("+", "%20");
    }
}

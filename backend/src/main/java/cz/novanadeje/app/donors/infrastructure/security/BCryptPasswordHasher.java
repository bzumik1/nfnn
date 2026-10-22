package cz.novanadeje.app.donors.infrastructure.security;

import cz.novanadeje.app.donors.domain.PasswordHash;
import cz.novanadeje.app.donors.domain.PasswordHasher;
import cz.novanadeje.app.donors.domain.RawPassword;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;

@Component
class BCryptPasswordHasher implements PasswordHasher {

    private static final int COST = 12;

    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder(COST);

    @Override
    public PasswordHash hash(RawPassword password) {
        return new PasswordHash(encoder.encode(digestOf(password)));
    }

    @Override
    public boolean matches(RawPassword password, PasswordHash hash) {
        return encoder.matches(digestOf(password), hash.value());
    }

    private static String digestOf(RawPassword password) {
        byte[] digest = sha256().digest(password.value().getBytes(StandardCharsets.UTF_8));
        return HexFormat.of().formatHex(digest);
    }

    private static MessageDigest sha256() {
        try {
            return MessageDigest.getInstance("SHA-256");
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 is part of every Java runtime", e);
        }
    }
}

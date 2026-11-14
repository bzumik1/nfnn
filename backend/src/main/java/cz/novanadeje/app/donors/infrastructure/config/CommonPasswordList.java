package cz.novanadeje.app.donors.infrastructure.config;

import cz.novanadeje.app.donors.domain.PasswordPolicy;
import cz.novanadeje.app.shared.domain.Sha256;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.Set;

final class CommonPasswordList {

    static final String LIST = "common-passwords.txt";
    static final String SHA256 = "64ddf3e8f1f468f6f135d28e412ae59681cb762ebf98037f8f108d65e52ca11e";

    private CommonPasswordList() {
    }

    static PasswordPolicy policy() {
        return policy(LIST, read(LIST));
    }

    static PasswordPolicy policy(String name, byte[] list) {
        if (!SHA256.equals(Sha256.hex(list))) {
            throw new IllegalArgumentException(
                    "The list of common passwords " + name + " does not have the SHA-256 it is pinned to, so it is damaged or replaced");
        }
        return new PasswordPolicy(Set.copyOf(new String(list, StandardCharsets.US_ASCII).lines().toList()));
    }

    static byte[] read(String name) {
        try (InputStream list = CommonPasswordList.class.getResourceAsStream(name)) {
            if (list == null) {
                throw new IllegalStateException("The list of common passwords " + name + " is missing from the classpath");
            }
            return list.readAllBytes();
        } catch (IOException unreadable) {
            throw new UncheckedIOException(unreadable);
        }
    }
}

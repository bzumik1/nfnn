package cz.novanadeje.app.operations.infrastructure.backup;

import cz.novanadeje.app.operations.domain.backup.BackupKeyWords;
import cz.novanadeje.app.shared.domain.Sha256;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;

final class BackupKeyWordList {

    static final String LIST = "bip39-czech.txt";
    static final String SHA256 = "7e80e161c3e93d9554c2efb78d4e3cebf8fc727e9c52e03b83b94406bdcc95fc";

    private BackupKeyWordList() {
    }

    static BackupKeyWords czech() {
        return czech(LIST, read(LIST));
    }

    static BackupKeyWords czech(String name, byte[] list) {
        if (!SHA256.equals(Sha256.hex(list))) {
            throw new IllegalArgumentException(
                    "The Czech BIP39 wordlist " + name + " does not have the SHA-256 it is pinned to, so it is damaged or replaced");
        }
        return new BackupKeyWords(new String(list, StandardCharsets.US_ASCII).lines().toList());
    }

    static byte[] read(String name) {
        try (InputStream list = BackupKeyWordList.class.getResourceAsStream(name)) {
            if (list == null) {
                throw new IllegalStateException("The Czech BIP39 wordlist " + name + " is missing from the classpath");
            }
            return list.readAllBytes();
        } catch (IOException unreadable) {
            throw new UncheckedIOException(unreadable);
        }
    }
}

package cz.novanadeje.app.operations.infrastructure.backup;

import cz.novanadeje.app.operations.domain.backup.BackupKeyWords;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.List;

@Configuration(proxyBeanMethods = false)
public class BackupKeyWordList {

    public static final String LIST = "bip39-czech.txt";

    @Bean
    BackupKeyWords backupKeyWords() {
        return czech();
    }

    public static BackupKeyWords czech() {
        return new BackupKeyWords(lines(LIST));
    }

    static List<String> lines(String name) {
        try (InputStream list = BackupKeyWordList.class.getResourceAsStream(name)) {
            if (list == null) {
                throw new IllegalStateException("The Czech BIP39 wordlist " + name + " is missing from the classpath");
            }
            return new String(list.readAllBytes(), StandardCharsets.US_ASCII).lines().toList();
        } catch (IOException unreadable) {
            throw new UncheckedIOException(unreadable);
        }
    }
}

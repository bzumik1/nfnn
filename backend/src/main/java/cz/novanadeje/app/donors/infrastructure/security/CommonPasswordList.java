package cz.novanadeje.app.donors.infrastructure.security;

import cz.novanadeje.app.donors.domain.PasswordPolicy;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Set;

@Configuration(proxyBeanMethods = false)
public class CommonPasswordList {

    static final String LIST = "common-passwords.txt";

    @Bean
    PasswordPolicy passwordPolicy() {
        return policy();
    }

    public static PasswordPolicy policy() {
        return new PasswordPolicy(Set.copyOf(lines(LIST)));
    }

    static List<String> lines(String name) {
        try (InputStream list = CommonPasswordList.class.getResourceAsStream(name)) {
            if (list == null) {
                throw new IllegalStateException("The list of common passwords " + name + " is missing from the classpath");
            }
            return new String(list.readAllBytes(), StandardCharsets.US_ASCII).lines().toList();
        } catch (IOException unreadable) {
            throw new UncheckedIOException(unreadable);
        }
    }
}

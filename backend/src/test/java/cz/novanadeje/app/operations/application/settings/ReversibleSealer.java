package cz.novanadeje.app.operations.application.settings;

import java.util.Optional;

public class ReversibleSealer implements SecretSealer {

    private final String prefix;
    private boolean available = true;
    private boolean readable = true;

    public ReversibleSealer() {
        this("sealed:");
    }

    public ReversibleSealer(String keyName) {
        this.prefix = keyName;
    }

    @Override
    public boolean available() {
        return available;
    }

    @Override
    public String seal(String purpose, String value) {
        return prefix + purpose + ":" + new StringBuilder(value).reverse();
    }

    @Override
    public Optional<String> unseal(String purpose, String sealed) {
        String expected = prefix + purpose + ":";
        if (!readable || !sealed.startsWith(expected)) {
            return Optional.empty();
        }
        return Optional.of(new StringBuilder(sealed.substring(expected.length())).reverse().toString());
    }

    public void withoutKey() {
        available = false;
    }

    public void withAnotherKey() {
        readable = false;
    }
}

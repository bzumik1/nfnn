package cz.novanadeje.app.operations.application.settings;

import cz.novanadeje.app.operations.domain.settings.Setting;

import java.util.Optional;

class ReversibleSealer implements SecretSealer {

    private final String prefix;
    private boolean available = true;
    private boolean readable = true;

    ReversibleSealer() {
        this("sealed:");
    }

    ReversibleSealer(String keyName) {
        this.prefix = keyName;
    }

    @Override
    public boolean available() {
        return available;
    }

    @Override
    public String seal(Setting setting, String value) {
        return prefix + setting + ":" + new StringBuilder(value).reverse();
    }

    @Override
    public Optional<String> unseal(Setting setting, String sealed) {
        String expected = prefix + setting + ":";
        if (!readable || !sealed.startsWith(expected)) {
            return Optional.empty();
        }
        return Optional.of(new StringBuilder(sealed.substring(expected.length())).reverse().toString());
    }

    void withoutKey() {
        available = false;
    }

    void withAnotherKey() {
        readable = false;
    }
}

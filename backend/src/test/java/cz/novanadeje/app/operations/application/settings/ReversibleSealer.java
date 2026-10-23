package cz.novanadeje.app.operations.application.settings;

import cz.novanadeje.app.operations.domain.settings.Setting;

import java.util.Optional;

class ReversibleSealer implements SecretSealer {

    private static final String PREFIX = "sealed:";

    private boolean available = true;
    private boolean readable = true;

    @Override
    public boolean available() {
        return available;
    }

    @Override
    public String seal(Setting setting, String value) {
        return PREFIX + setting + ":" + new StringBuilder(value).reverse();
    }

    @Override
    public Optional<String> unseal(Setting setting, String sealed) {
        String prefix = PREFIX + setting + ":";
        if (!readable || !sealed.startsWith(prefix)) {
            return Optional.empty();
        }
        return Optional.of(new StringBuilder(sealed.substring(prefix.length())).reverse().toString());
    }

    void withoutKey() {
        available = false;
    }

    void withAnotherKey() {
        readable = false;
    }
}

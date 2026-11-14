package cz.novanadeje.app.donors.domain;

import java.util.Locale;
import java.util.Objects;
import java.util.Set;

public record PasswordPolicy(Set<String> commonPasswords) {

    public PasswordPolicy {
        commonPasswords = Set.copyOf(Objects.requireNonNull(commonPasswords, "commonPasswords"));
    }

    public RawPassword accept(String value) {
        RawPassword password = new RawPassword(value);
        if (commonPasswords.contains(value.toLowerCase(Locale.ROOT))) {
            throw PasswordTooWeak.tooCommon();
        }
        return password;
    }

    @Override
    public String toString() {
        return "PasswordPolicy[" + commonPasswords.size() + " common passwords]";
    }
}

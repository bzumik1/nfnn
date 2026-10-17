package cz.novanadeje.app.donors.domain;

import cz.novanadeje.app.shared.domain.error.RuleViolation;

public class PasswordTooWeak extends RuleViolation {

    public PasswordTooWeak(String code, String message) {
        super(code, message);
    }

    public static PasswordTooWeak tooShort(int minimum) {
        return new PasswordTooWeak("donors/password-too-short", "Password must have at least " + minimum + " characters");
    }

    public static PasswordTooWeak tooLong(int maximum) {
        return new PasswordTooWeak("donors/password-too-long", "Password must not exceed " + maximum + " characters");
    }

    public static PasswordTooWeak tooCommon() {
        return new PasswordTooWeak("donors/password-too-common", "Password is too common");
    }
}

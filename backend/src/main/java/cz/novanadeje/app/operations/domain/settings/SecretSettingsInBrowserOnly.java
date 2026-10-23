package cz.novanadeje.app.operations.domain.settings;

import cz.novanadeje.app.shared.domain.error.AccessDenied;

public class SecretSettingsInBrowserOnly extends AccessDenied {

    public static final String CODE = "operations/secret-settings-in-browser-only";

    public SecretSettingsInBrowserOnly() {
        super(CODE, "Passwords, tokens and the site's address change only in the administration in a browser, never through a connected application");
    }
}

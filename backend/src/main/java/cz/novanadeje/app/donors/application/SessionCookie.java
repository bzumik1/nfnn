package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.SessionKind;

public enum SessionCookie {
    BROWSER, APP;

    public static SessionCookie of(SessionKind kind) {
        return kind.installedApp() ? APP : BROWSER;
    }
}

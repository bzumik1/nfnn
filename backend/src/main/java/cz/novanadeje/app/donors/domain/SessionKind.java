package cz.novanadeje.app.donors.domain;

public enum SessionKind {
    APP, REMEMBERED, BROWSER, PUBLIC;

    public static final SessionKind UNNAMED = REMEMBERED;

    public boolean outlivesTheBrowser() {
        return this == APP || this == REMEMBERED;
    }

    public boolean installedApp() {
        return this == APP;
    }
}

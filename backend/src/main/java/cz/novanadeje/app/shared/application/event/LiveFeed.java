package cz.novanadeje.app.shared.application.event;

public enum LiveFeed {

    DONATIONS("donations", Audience.DONOR),
    BANK_ACCOUNTS("bank-accounts", Audience.DONOR),
    BANK_IMPORT("bank-import", Audience.EVERYONE),
    PAYMENTS("payments", Audience.ADMINISTRATION);

    private final String wireName;
    private final Audience audience;

    LiveFeed(String wireName, Audience audience) {
        this.wireName = wireName;
        this.audience = audience;
    }

    public String wireName() {
        return wireName;
    }

    public Audience audience() {
        return audience;
    }

    public enum Audience {
        DONOR,
        EVERYONE,
        ADMINISTRATION
    }
}

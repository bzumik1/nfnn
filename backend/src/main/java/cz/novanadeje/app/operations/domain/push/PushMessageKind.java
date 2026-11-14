package cz.novanadeje.app.operations.domain.push;

import cz.novanadeje.app.operations.domain.alerts.MonitoredArea;

import java.util.Arrays;
import java.util.Objects;
import java.util.Optional;

public enum PushMessageKind {
    TEST("test", Audience.ADMINISTRATORS),
    BANK_IMPORT_OUTAGE("bank-import-outage", MonitoredArea.BANK_IMPORT, true),
    BANK_IMPORT_RECOVERED("bank-import-recovered", MonitoredArea.BANK_IMPORT, false),
    BACKUPS_OUTAGE("backups-outage", MonitoredArea.BACKUPS, true),
    BACKUPS_RECOVERED("backups-recovered", MonitoredArea.BACKUPS, false),
    MAIL_OUTAGE("mail-outage", MonitoredArea.MAIL, true),
    MAIL_RECOVERED("mail-recovered", MonitoredArea.MAIL, false),
    DONOR_TEST("donor-test", Audience.DONORS),
    GIFT_ARRIVED("gift-arrived", Audience.DONORS),
    YEARLY_RECEIPT_READY("yearly-receipt-ready", Audience.DONORS);

    private enum Audience {
        ADMINISTRATORS,
        DONORS
    }

    private final String token;
    private final MonitoredArea area;
    private final boolean outage;
    private final Audience audience;

    PushMessageKind(String token, MonitoredArea area, boolean outage) {
        this.token = token;
        this.area = area;
        this.outage = outage;
        this.audience = Audience.ADMINISTRATORS;
    }

    PushMessageKind(String token, Audience audience) {
        this.token = token;
        this.area = null;
        this.outage = false;
        this.audience = audience;
    }

    public static PushMessageKind of(MonitoredArea area, boolean opened) {
        Objects.requireNonNull(area, "area");
        return Arrays.stream(values()).filter(kind -> kind.area == area && kind.outage == opened).findFirst().orElseThrow();
    }

    public String token() {
        return token;
    }

    public Optional<MonitoredArea> area() {
        return Optional.ofNullable(area);
    }

    public boolean carriesOpenAlertCount() {
        return audience == Audience.ADMINISTRATORS;
    }
}

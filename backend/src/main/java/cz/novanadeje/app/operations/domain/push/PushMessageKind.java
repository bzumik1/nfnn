package cz.novanadeje.app.operations.domain.push;

import cz.novanadeje.app.operations.domain.alerts.MonitoredArea;

import java.util.Arrays;
import java.util.Optional;

public enum PushMessageKind {
    TEST("test", false),
    BANK_IMPORT_OUTAGE("bank-import-outage", MonitoredArea.BANK_IMPORT, true),
    BANK_IMPORT_RECOVERED("bank-import-recovered", MonitoredArea.BANK_IMPORT, false),
    BACKUPS_OUTAGE("backups-outage", MonitoredArea.BACKUPS, true),
    BACKUPS_RECOVERED("backups-recovered", MonitoredArea.BACKUPS, false),
    MAIL_OUTAGE("mail-outage", MonitoredArea.MAIL, true),
    MAIL_RECOVERED("mail-recovered", MonitoredArea.MAIL, false),
    DONOR_TEST("donor-test", true),
    GIFT_ARRIVED("gift-arrived", true),
    YEARLY_RECEIPT_READY("yearly-receipt-ready", true);

    private final String token;
    private final MonitoredArea area;
    private final boolean outage;
    private final boolean toDonors;

    PushMessageKind(String token, MonitoredArea area, boolean outage) {
        this.token = token;
        this.area = area;
        this.outage = outage;
        this.toDonors = false;
    }

    PushMessageKind(String token, boolean toDonors) {
        this.token = token;
        this.area = null;
        this.outage = false;
        this.toDonors = toDonors;
    }

    public static PushMessageKind of(MonitoredArea area, boolean opened) {
        return Arrays.stream(values()).filter(kind -> kind.area == area && kind.outage == opened).findFirst().orElseThrow();
    }

    public String token() {
        return token;
    }

    public Optional<MonitoredArea> area() {
        return Optional.ofNullable(area);
    }

    public boolean carriesOpenAlertCount() {
        return !toDonors;
    }
}

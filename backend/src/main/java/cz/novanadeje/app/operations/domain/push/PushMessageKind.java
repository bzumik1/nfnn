package cz.novanadeje.app.operations.domain.push;

import cz.novanadeje.app.operations.domain.alerts.MonitoredArea;

import java.util.Arrays;
import java.util.Optional;

public enum PushMessageKind {
    TEST("test", Optional.empty(), false),
    BANK_IMPORT_OUTAGE("bank-import-outage", Optional.of(MonitoredArea.BANK_IMPORT), true),
    BANK_IMPORT_RECOVERED("bank-import-recovered", Optional.of(MonitoredArea.BANK_IMPORT), false),
    BACKUPS_OUTAGE("backups-outage", Optional.of(MonitoredArea.BACKUPS), true),
    BACKUPS_RECOVERED("backups-recovered", Optional.of(MonitoredArea.BACKUPS), false),
    MAIL_OUTAGE("mail-outage", Optional.of(MonitoredArea.MAIL), true),
    MAIL_RECOVERED("mail-recovered", Optional.of(MonitoredArea.MAIL), false);

    private final String token;
    private final Optional<MonitoredArea> area;
    private final boolean outage;

    PushMessageKind(String token, Optional<MonitoredArea> area, boolean outage) {
        this.token = token;
        this.area = area;
        this.outage = outage;
    }

    public static PushMessageKind of(MonitoredArea area, boolean opened) {
        return Arrays.stream(values()).filter(kind -> kind.area.equals(Optional.of(area)) && kind.outage == opened).findFirst().orElseThrow();
    }

    public String token() {
        return token;
    }

    public Optional<MonitoredArea> area() {
        return area;
    }
}

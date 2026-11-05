package cz.novanadeje.app.operations.domain.push;

import cz.novanadeje.app.operations.domain.alerts.MonitoredArea;

public record PushAlerts(boolean bankImport, boolean backups, boolean mail) {

    public static final PushAlerts ALL = new PushAlerts(true, true, true);

    public boolean covers(MonitoredArea area) {
        return switch (area) {
            case BANK_IMPORT -> bankImport;
            case BACKUPS -> backups;
            case MAIL -> mail;
        };
    }
}

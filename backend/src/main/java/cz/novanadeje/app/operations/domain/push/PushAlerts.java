package cz.novanadeje.app.operations.domain.push;

public record PushAlerts(boolean bankImport, boolean backups, boolean mail) {

    public static final PushAlerts ALL = new PushAlerts(true, true, true);
}

package cz.novanadeje.app.donations.domain.importing;

public record WaitingImportAlert(ImportAlertId id, ImportAlert alert) {

    public WaitingImportAlert {
        if (id == null || alert == null) {
            throw new IllegalArgumentException("A waiting import alert has an id and an alert");
        }
    }
}

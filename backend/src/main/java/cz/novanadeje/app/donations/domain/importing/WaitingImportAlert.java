package cz.novanadeje.app.donations.domain.importing;

import java.util.UUID;

public record WaitingImportAlert(UUID id, ImportAlert alert) {

    public WaitingImportAlert {
        if (id == null || alert == null) {
            throw new IllegalArgumentException("A waiting import alert has an id and an alert");
        }
    }
}

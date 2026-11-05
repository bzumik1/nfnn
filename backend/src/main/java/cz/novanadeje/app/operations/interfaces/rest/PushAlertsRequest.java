package cz.novanadeje.app.operations.interfaces.rest;

import cz.novanadeje.app.operations.domain.push.PushAlerts;
import jakarta.validation.constraints.NotNull;

record PushAlertsRequest(@NotNull Boolean bankImport, @NotNull Boolean backups, @NotNull Boolean mail) {

    PushAlerts toAlerts() {
        return new PushAlerts(bankImport, backups, mail);
    }
}

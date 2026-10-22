package cz.novanadeje.app.donations.application.event;

import cz.novanadeje.app.donations.domain.importing.ImportRecovery;

import java.util.Objects;

public record BankImportRecovered(ImportRecovery recovery) {

    public BankImportRecovered {
        Objects.requireNonNull(recovery, "recovery");
    }
}

package cz.novanadeje.app.donations.application.event;

import cz.novanadeje.app.donations.domain.importing.ImportOutage;

import java.util.Objects;

public record BankImportOutageDetected(ImportOutage outage) {

    public BankImportOutageDetected {
        Objects.requireNonNull(outage, "outage");
    }
}

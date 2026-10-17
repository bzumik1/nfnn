package cz.novanadeje.app.donations.application.importing;

import cz.novanadeje.app.donations.domain.bank.IncomingMovement;
import cz.novanadeje.app.donations.domain.importing.ImportPeriod;

import java.util.List;
import java.util.Optional;

public record BankStatement(ImportPeriod requested, Optional<ImportPeriod> reported, List<IncomingMovement> incoming, int movementsReceived) {

    public BankStatement {
        if (requested == null || reported == null || incoming == null) {
            throw new IllegalArgumentException("A bank statement needs the requested period, the optional reported one and the movements");
        }
        if (movementsReceived < incoming.size()) {
            throw new IllegalArgumentException("A statement cannot hold more incoming movements than it received");
        }
        incoming = List.copyOf(incoming);
    }
}

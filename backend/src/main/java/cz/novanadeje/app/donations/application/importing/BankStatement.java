package cz.novanadeje.app.donations.application.importing;

import cz.novanadeje.app.donations.domain.bank.IncomingMovement;
import cz.novanadeje.app.donations.domain.importing.ImportPeriod;
import cz.novanadeje.app.shared.domain.Money;

import java.util.List;
import java.util.Optional;

public record BankStatement(ImportPeriod requested, Optional<ImportPeriod> reported, List<IncomingMovement> incoming, int movementsReceived,
                            Optional<Money> closingBalance) {

    public BankStatement {
        if (requested == null || reported == null || incoming == null || closingBalance == null) {
            throw new IllegalArgumentException("A bank statement needs the requested period, the optional reported one, the movements "
                    + "and the optional closing balance");
        }
        if (movementsReceived < incoming.size()) {
            throw new IllegalArgumentException("A statement cannot hold more incoming movements than it received");
        }
        incoming = List.copyOf(incoming);
    }
}

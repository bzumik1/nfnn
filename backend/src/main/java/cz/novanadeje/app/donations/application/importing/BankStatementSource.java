package cz.novanadeje.app.donations.application.importing;

import cz.novanadeje.app.donations.domain.importing.ImportPeriod;

public interface BankStatementSource {

    BankStatement fetch(ImportPeriod requested);
}

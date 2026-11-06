package cz.novanadeje.app.donations.domain.importing;

import cz.novanadeje.app.shared.domain.error.Conflict;

public class BankImportOff extends Conflict {

    public static final String CODE = "donations/bank-import-off";

    public BankImportOff() {
        super(CODE, "The bank import is off because no Fio token is set");
    }
}

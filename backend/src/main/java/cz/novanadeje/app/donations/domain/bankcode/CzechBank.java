package cz.novanadeje.app.donations.domain.bankcode;

public record CzechBank(BankCode code, BankName name) {

    public CzechBank {
        if (code == null || name == null) {
            throw new IllegalArgumentException("A bank has a code and a name");
        }
    }
}

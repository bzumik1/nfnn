package cz.novanadeje.app.donors.application;

public class CompanyRegistryUnavailable extends RuntimeException {

    private final String outcome;

    public CompanyRegistryUnavailable(String outcome) {
        super(outcome, null, false, false);
        this.outcome = outcome;
    }

    public String outcome() {
        return outcome;
    }
}

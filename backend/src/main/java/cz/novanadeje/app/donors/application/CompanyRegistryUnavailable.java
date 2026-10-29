package cz.novanadeje.app.donors.application;

public class CompanyRegistryUnavailable extends RuntimeException {

    public CompanyRegistryUnavailable(String outcome) {
        super(outcome, null, false, false);
    }
}

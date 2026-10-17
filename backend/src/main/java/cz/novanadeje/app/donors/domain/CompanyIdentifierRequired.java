package cz.novanadeje.app.donors.domain;

import cz.novanadeje.app.shared.domain.error.RuleViolation;

public class CompanyIdentifierRequired extends RuleViolation {

    public CompanyIdentifierRequired() {
        super("donors/company-identifier-required", "A company must register with its company identifier");
    }
}

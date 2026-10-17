package cz.novanadeje.app.donors.domain;

import cz.novanadeje.app.shared.domain.error.RuleViolation;

public class CompanyIdentifierNotAllowed extends RuleViolation {

    public CompanyIdentifierNotAllowed() {
        super("donors/company-identifier-not-allowed", "A person does not have a company identifier");
    }
}

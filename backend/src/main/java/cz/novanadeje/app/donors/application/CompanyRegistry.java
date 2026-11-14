package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.RegisteredCompany;

import cz.novanadeje.app.shared.domain.CompanyIdentifier;
import java.util.Optional;

public interface CompanyRegistry {

    Optional<RegisteredCompany> find(CompanyIdentifier identifier);
}

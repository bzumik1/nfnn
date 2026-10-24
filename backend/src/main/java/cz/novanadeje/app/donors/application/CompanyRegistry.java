package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.CompanyIdentifier;
import cz.novanadeje.app.donors.domain.RegisteredCompany;

import java.util.Optional;

public interface CompanyRegistry {

    Optional<RegisteredCompany> find(CompanyIdentifier identifier);
}

package cz.novanadeje.app.donors.application.event;

import cz.novanadeje.app.donors.domain.CompanyIdentifier;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.DonorType;
import cz.novanadeje.app.shared.domain.VariableSymbol;
import cz.novanadeje.app.shared.domain.EmailAddress;
import cz.novanadeje.app.shared.domain.PostalAddress;

import java.time.Instant;
import java.util.Optional;

public record DonorRegistered(
        DonorId donorId,
        DonorType type,
        String name,
        Optional<CompanyIdentifier> companyIdentifier,
        PostalAddress address,
        EmailAddress email,
        VariableSymbol variableSymbol,
        Instant registeredAt
) {
}

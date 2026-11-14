package cz.novanadeje.app.donations.application.donor;

import cz.novanadeje.app.shared.domain.CompanyIdentifier;
import cz.novanadeje.app.shared.domain.DonorName;
import cz.novanadeje.app.shared.domain.DonorType;
import cz.novanadeje.app.shared.domain.LocaleCode;
import cz.novanadeje.app.shared.domain.PostalAddress;
import cz.novanadeje.app.shared.domain.VariableSymbol;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

public record RegisterDonorRecordCommand(
        UUID donorId,
        DonorType type,
        DonorName name,
        Optional<CompanyIdentifier> companyIdentifier,
        PostalAddress address,
        VariableSymbol variableSymbol,
        LocaleCode preferredLocale,
        Instant registeredAt
) {
}

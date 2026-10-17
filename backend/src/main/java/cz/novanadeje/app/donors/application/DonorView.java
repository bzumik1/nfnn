package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.CompanyIdentifier;
import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorType;
import cz.novanadeje.app.donors.domain.Role;
import cz.novanadeje.app.shared.domain.PostalAddress;

import java.time.Instant;
import java.util.Comparator;
import java.util.List;

public record DonorView(
        String id,
        DonorType type,
        String name,
        String companyIdentifier,
        PostalAddress address,
        String email,
        String preferredLocale,
        String variableSymbol,
        List<Role> roles,
        Instant registeredAt
) {

    public static DonorView of(Donor donor) {
        return new DonorView(
                donor.id().toString(),
                donor.type(),
                donor.name(),
                donor.companyIdentifier().map(CompanyIdentifier::value).orElse(null),
                donor.address(),
                donor.email().value(),
                donor.preferredLocale().tag(),
                donor.variableSymbol().value(),
                donor.roles().stream().sorted(Comparator.naturalOrder()).toList(),
                donor.registeredAt()
        );
    }
}

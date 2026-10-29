package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.CompanyIdentifier;
import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.Role;
import cz.novanadeje.app.shared.domain.DonorType;
import cz.novanadeje.app.shared.domain.PostalAddress;

import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.Set;

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
        Instant registeredAt,
        boolean hasPassword,
        SecondFactorView secondFactor,
        Optional<PendingEmailChangeView> pendingEmailChange
) {

    public static DonorView of(Donor donor, Set<Role> sessionRoles, SecondFactorView secondFactor,
                               Optional<PendingEmailChangeView> pendingEmailChange) {
        return new DonorView(
                donor.id().toString(),
                donor.type(),
                donor.name(),
                donor.companyIdentifier().map(CompanyIdentifier::value).orElse(null),
                donor.address(),
                donor.email().value(),
                donor.preferredLocale().tag(),
                donor.variableSymbol().value(),
                sessionRoles.stream().sorted(Comparator.naturalOrder()).toList(),
                donor.registeredAt(),
                donor.hasPassword(),
                secondFactor,
                pendingEmailChange
        );
    }
}

package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.RegistrationReturn;
import cz.novanadeje.app.shared.domain.DonorType;

import java.util.Optional;

public record RegisterDonorCommand(
        DonorType type,
        String name,
        String companyIdentifier,
        String street,
        String city,
        String postalCode,
        String email,
        String password,
        String preferredLocale,
        Optional<RegistrationReturn> returnTo
) {
}

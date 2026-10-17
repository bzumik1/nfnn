package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.DonorType;

public record RegisterDonorCommand(
        DonorType type,
        String name,
        String companyIdentifier,
        String street,
        String city,
        String postalCode,
        String email,
        String password,
        String preferredLocale
) {
}

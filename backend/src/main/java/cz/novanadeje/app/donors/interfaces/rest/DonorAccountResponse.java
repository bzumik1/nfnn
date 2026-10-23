package cz.novanadeje.app.donors.interfaces.rest;

import cz.novanadeje.app.donors.application.DonorAccountView;
import cz.novanadeje.app.donors.domain.CompanyIdentifier;
import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.shared.domain.DonorType;

import java.time.Instant;

record DonorAccountResponse(String donorId, DonorType type, String name, String companyIdentifier, AddressResponse address, String email,
                            String variableSymbol, String preferredLocale, Instant registeredAt, boolean emailVerified, boolean administrator,
                            boolean secondFactorEnabled) {

    record AddressResponse(String street, String city, String postalCode) {
    }

    static DonorAccountResponse from(DonorAccountView view) {
        Donor donor = view.donor();
        return new DonorAccountResponse(donor.id().value().toString(), donor.type(), donor.name(),
                donor.companyIdentifier().map(CompanyIdentifier::value).orElse(null),
                new AddressResponse(donor.address().street(), donor.address().city(), donor.address().postalCode()),
                donor.email().value(), donor.variableSymbol().value(), donor.preferredLocale().tag(), donor.registeredAt(),
                donor.isEmailVerified(), donor.isAdministrator(), view.secondFactorEnabled());
    }
}

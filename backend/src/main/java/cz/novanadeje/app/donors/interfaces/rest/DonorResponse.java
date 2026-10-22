package cz.novanadeje.app.donors.interfaces.rest;

import cz.novanadeje.app.donors.application.DonorView;
import cz.novanadeje.app.donors.domain.Role;
import cz.novanadeje.app.shared.domain.DonorType;

import java.time.Instant;
import java.util.List;

record DonorResponse(
        String id,
        DonorType type,
        String name,
        String companyIdentifier,
        AddressResponse address,
        String email,
        String preferredLocale,
        String variableSymbol,
        List<Role> roles,
        Instant registeredAt,
        SecondFactorResponse secondFactor
) {

    record AddressResponse(String street, String city, String postalCode) {
    }

    record SecondFactorResponse(boolean enabled, boolean neededForAdministration) {
    }

    static DonorResponse of(DonorView view) {
        return new DonorResponse(
                view.id(),
                view.type(),
                view.name(),
                view.companyIdentifier(),
                new AddressResponse(view.address().street(), view.address().city(), view.address().postalCode()),
                view.email(),
                view.preferredLocale(),
                view.variableSymbol(),
                view.roles(),
                view.registeredAt(),
                new SecondFactorResponse(view.secondFactor().enabled(), view.secondFactor().neededForAdministration())
        );
    }
}

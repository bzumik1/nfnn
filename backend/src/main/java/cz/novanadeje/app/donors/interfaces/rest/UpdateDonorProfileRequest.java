package cz.novanadeje.app.donors.interfaces.rest;

import cz.novanadeje.app.donors.application.UpdateDonorProfileCommand;
import cz.novanadeje.app.donors.domain.Donor;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

record UpdateDonorProfileRequest(
        @Size(min = 1, max = Donor.MAX_NAME_LENGTH) @Pattern(regexp = Donor.NOT_BLANK_NAME, message = "{donors.profile.name.blank}") String name,
        @Valid AddressRequest address,
        @Pattern(regexp = "cs|en") String preferredLocale
) {

    UpdateDonorProfileCommand toCommand() {
        return new UpdateDonorProfileCommand(
                name,
                address == null ? null : address.street(),
                address == null ? null : address.city(),
                address == null ? null : address.postalCode(),
                preferredLocale
        );
    }
}

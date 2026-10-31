package cz.novanadeje.app.donors.interfaces.rest;

import cz.novanadeje.app.donors.application.UpdateDonorProfileCommand;
import cz.novanadeje.app.donors.domain.Donor;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

record UpdateDonorProfileRequest(
        @Size(min = 1, max = Donor.MAX_NAME_LENGTH) @PrintableOnReceipt String name,
        @Valid AddressRequest address,
        @Pattern(regexp = "cs|en") String preferredLocale
) {

    UpdateDonorProfileCommand toCommand() {
        return new UpdateDonorProfileCommand(
                PrintedInput.of(name),
                address == null ? null : PrintedInput.of(address.street()),
                address == null ? null : PrintedInput.of(address.city()),
                address == null ? null : address.postalCode(),
                preferredLocale
        );
    }
}

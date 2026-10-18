package cz.novanadeje.app.donors.interfaces.rest;

import cz.novanadeje.app.donors.application.RegisterDonorCommand;
import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.RawPassword;
import cz.novanadeje.app.shared.domain.DonorType;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

record RegisterDonorRequest(
        @NotNull DonorType type,
        @NotBlank @Size(max = Donor.MAX_NAME_LENGTH) String name,
        @ValidCompanyIdentifier String companyIdentifier,
        @NotNull @Valid AddressRequest address,
        @NotBlank @Email @Size(max = 254) String email,
        @NotBlank @Size(min = RawPassword.MIN_LENGTH, max = RawPassword.MAX_LENGTH) String password,
        @Pattern(regexp = "cs|en") String preferredLocale
) {

    RegisterDonorCommand toCommand() {
        return new RegisterDonorCommand(type, name, companyIdentifier, address.street(), address.city(), address.postalCode(),
                email, password, preferredLocale);
    }

    @Override
    public String toString() {
        return "RegisterDonorRequest[type=" + type + ", name=***, companyIdentifier=" + companyIdentifier
                + ", address=***, email=***, password=***, preferredLocale=" + preferredLocale + "]";
    }
}

package cz.novanadeje.app.donors.interfaces.rest;

import cz.novanadeje.app.shared.domain.PostalAddress;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

record AddressRequest(
        @NotBlank @Size(max = PostalAddress.MAX_STREET_LENGTH) String street,
        @NotBlank @Size(max = PostalAddress.MAX_CITY_LENGTH) String city,
        @NotBlank @Size(max = PostalAddress.MAX_POSTAL_CODE_LENGTH) @Pattern(regexp = "\\s*[0-9][0-9 ]*[0-9]\\s*") String postalCode
) {
}

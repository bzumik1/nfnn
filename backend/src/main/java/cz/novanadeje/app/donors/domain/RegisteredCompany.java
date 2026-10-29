package cz.novanadeje.app.donors.domain;

import cz.novanadeje.app.shared.domain.PostalAddress;

import java.util.Objects;
import java.util.Optional;

public record RegisteredCompany(CompanyIdentifier identifier, String name, Optional<PostalAddress> seat) {

    public RegisteredCompany {
        Objects.requireNonNull(identifier, "identifier");
        Objects.requireNonNull(seat, "seat");
        if (name == null || name.isBlank()) {
            throw new IllegalArgumentException("Company name is required");
        }
        name = name.trim().replaceAll("\\s+", " ");
        if (name.length() > Donor.MAX_NAME_LENGTH) {
            throw new IllegalArgumentException("Company name must not exceed " + Donor.MAX_NAME_LENGTH + " characters");
        }
    }
}

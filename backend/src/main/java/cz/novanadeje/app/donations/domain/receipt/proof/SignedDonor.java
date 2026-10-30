package cz.novanadeje.app.donations.domain.receipt.proof;

import cz.novanadeje.app.shared.domain.DonorType;

import java.text.Normalizer;
import java.util.Optional;
import java.util.regex.Pattern;

public record SignedDonor(DonorType type, String name, String street, String city, String postalCode, Optional<String> companyIdentifier) {

    private static final Pattern COMPANY_IDENTIFIER = Pattern.compile("[0-9]{8}");

    public SignedDonor {
        if (type == null || companyIdentifier == null) {
            throw new IllegalArgumentException("A signed donor needs the type and the identifier (even when absent)");
        }
        name = text(name, "name");
        street = text(street, "street");
        city = text(city, "city");
        postalCode = text(postalCode, "postal code");
        if ((type == DonorType.COMPANY) != companyIdentifier.isPresent()) {
            throw new IllegalArgumentException("A company and only a company has a company identifier");
        }
        if (companyIdentifier.filter(identifier -> !COMPANY_IDENTIFIER.matcher(identifier).matches()).isPresent()) {
            throw new IllegalArgumentException("A company identifier is eight digits: " + companyIdentifier.get());
        }
    }

    private static String text(String value, String label) {
        if (value == null || value.isEmpty()) {
            throw new IllegalArgumentException("A signed donor needs the " + label);
        }
        return Normalizer.normalize(value, Normalizer.Form.NFC);
    }
}

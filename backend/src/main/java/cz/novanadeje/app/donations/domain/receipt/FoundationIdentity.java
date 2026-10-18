package cz.novanadeje.app.donations.domain.receipt;

import cz.novanadeje.app.shared.domain.PostalAddress;

import java.util.regex.Pattern;

public record FoundationIdentity(String name, String companyIdentifier, PostalAddress address, String registryCourt, String registryFile,
                                 String bankAccountNumber, String issuePlace, String issuePlaceEn) {

    private static final Pattern COMPANY_IDENTIFIER = Pattern.compile("[0-9]{8}");

    public FoundationIdentity {
        name = requireText(name, "Foundation name");
        companyIdentifier = requireText(companyIdentifier, "Foundation company identifier");
        if (!COMPANY_IDENTIFIER.matcher(companyIdentifier).matches()) {
            throw new IllegalArgumentException("The foundation's company identifier is eight digits: " + companyIdentifier);
        }
        if (address == null) {
            throw new IllegalArgumentException("Foundation address is required");
        }
        registryCourt = requireText(registryCourt, "Registry court");
        registryFile = requireText(registryFile, "Registry file");
        bankAccountNumber = requireText(bankAccountNumber, "Bank account number");
        issuePlace = requireText(issuePlace, "Issue place");
        issuePlaceEn = requireText(issuePlaceEn, "English issue place");
    }

    private static String requireText(String value, String label) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(label + " is required");
        }
        return value.trim();
    }
}

package cz.novanadeje.app.donations.infrastructure.pdf;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.nio.file.Path;
import java.util.Optional;
import java.util.regex.Pattern;

@ConfigurationProperties("app.donations.receipt")
public record ReceiptProperties(String foundationName, String foundationCompanyIdentifier, String foundationStreet, String foundationCity,
                                String foundationPostalCode, String registryCourt, String registryFile, String issuePlace,
                                String issuePlaceEn, String signatoryName, String signatoryRole, String signatureImage,
                                Integer concurrentRenders) {

    private static final String PREFIX = "app.donations.receipt.";
    private static final Pattern COMPANY_IDENTIFIER = Pattern.compile("[0-9]{8}");
    private static final int DEFAULT_CONCURRENT_RENDERS = 3;

    public ReceiptProperties {
        foundationName = required(foundationName, PREFIX + "foundation-name");
        foundationCompanyIdentifier = required(foundationCompanyIdentifier, PREFIX + "foundation-company-identifier");
        if (!COMPANY_IDENTIFIER.matcher(foundationCompanyIdentifier).matches()) {
            throw new IllegalArgumentException(PREFIX + "foundation-company-identifier must be eight digits, but is '"
                    + foundationCompanyIdentifier + "'");
        }
        foundationStreet = required(foundationStreet, PREFIX + "foundation-street");
        foundationCity = required(foundationCity, PREFIX + "foundation-city");
        foundationPostalCode = required(foundationPostalCode, PREFIX + "foundation-postal-code");
        registryCourt = required(registryCourt, PREFIX + "registry-court");
        registryFile = required(registryFile, PREFIX + "registry-file");
        issuePlace = required(issuePlace, PREFIX + "issue-place");
        issuePlaceEn = required(issuePlaceEn, PREFIX + "issue-place-en");
        signatoryName = required(signatoryName, "RECEIPT_SIGNATORY_NAME (" + PREFIX + "signatory-name)");
        signatoryRole = required(signatoryRole, "RECEIPT_SIGNATORY_ROLE (" + PREFIX + "signatory-role)");
        signatureImage = signatureImage == null || signatureImage.isBlank() ? null : signatureImage.trim();
        concurrentRenders = concurrentRenders == null ? DEFAULT_CONCURRENT_RENDERS : concurrentRenders;
        if (concurrentRenders < 1) {
            throw new IllegalArgumentException(PREFIX + "concurrent-renders must be at least 1, but is " + concurrentRenders);
        }
    }

    public Optional<Path> signatureImagePath() {
        return Optional.ofNullable(signatureImage).map(Path::of);
    }

    private static String required(String value, String name) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(name + " is required");
        }
        return value.trim();
    }
}

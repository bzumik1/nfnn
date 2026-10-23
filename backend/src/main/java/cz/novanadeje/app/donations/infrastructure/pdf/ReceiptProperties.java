package cz.novanadeje.app.donations.infrastructure.pdf;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Year;
import java.util.regex.Pattern;

@ConfigurationProperties("app.donations.receipt")
public record ReceiptProperties(String foundationName, String foundationCompanyIdentifier, String foundationStreet, String foundationCity,
                                String foundationPostalCode, String registryCourt, String registryFile, String issuePlace,
                                String issuePlaceEn, String signatoryName, String signatoryRole,
                                Integer concurrentRenders, Integer firstYear) {

    private static final String PREFIX = "app.donations.receipt.";
    private static final Pattern COMPANY_IDENTIFIER = Pattern.compile("[0-9]{8}");
    private static final int DEFAULT_CONCURRENT_RENDERS = 3;
    private static final int DEFAULT_FIRST_YEAR = 2026;
    private static final int FIRST_FOUR_DIGIT_YEAR = 1000;
    private static final int LAST_FOUR_DIGIT_YEAR = 9999;

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
        concurrentRenders = concurrentRenders == null ? DEFAULT_CONCURRENT_RENDERS : concurrentRenders;
        if (concurrentRenders < 1) {
            throw new IllegalArgumentException(PREFIX + "concurrent-renders must be at least 1, but is " + concurrentRenders);
        }
        firstYear = firstYear == null ? DEFAULT_FIRST_YEAR : firstYear;
        if (firstYear < FIRST_FOUR_DIGIT_YEAR || firstYear > LAST_FOUR_DIGIT_YEAR) {
            throw new IllegalArgumentException("RECEIPT_FIRST_YEAR (" + PREFIX + "first-year) must be a four-digit year, but is " + firstYear);
        }
    }

    public Year firstReceiptYear() {
        return Year.of(firstYear);
    }

    private static String required(String value, String name) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(name + " is required");
        }
        return value.trim();
    }
}

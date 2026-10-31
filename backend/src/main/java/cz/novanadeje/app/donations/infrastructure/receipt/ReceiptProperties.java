package cz.novanadeje.app.donations.infrastructure.receipt;

import cz.novanadeje.app.shared.domain.PrintableText;
import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Year;
import java.util.stream.Collectors;
import java.util.regex.Pattern;

@ConfigurationProperties("app.donations.receipt")
public record ReceiptProperties(String foundationName, String foundationCompanyIdentifier, String foundationStreet, String foundationCity,
                                String foundationPostalCode, String registryCourt, String registryFile, String issuePlace,
                                String issuePlaceEn, Integer firstYear) {

    private static final String PREFIX = "app.donations.receipt.";
    private static final Pattern COMPANY_IDENTIFIER = Pattern.compile("[0-9]{8}");
    private static final int DEFAULT_FIRST_YEAR = 2026;
    private static final int FIRST_FOUR_DIGIT_YEAR = 1000;
    private static final int LAST_FOUR_DIGIT_YEAR = 9999;

    public ReceiptProperties {
        foundationName = printed(foundationName, PREFIX + "foundation-name");
        foundationCompanyIdentifier = required(foundationCompanyIdentifier, PREFIX + "foundation-company-identifier");
        if (!COMPANY_IDENTIFIER.matcher(foundationCompanyIdentifier).matches()) {
            throw new IllegalArgumentException(PREFIX + "foundation-company-identifier must be eight digits, but is '"
                    + foundationCompanyIdentifier + "'");
        }
        foundationStreet = printed(foundationStreet, PREFIX + "foundation-street");
        foundationCity = printed(foundationCity, PREFIX + "foundation-city");
        foundationPostalCode = required(foundationPostalCode, PREFIX + "foundation-postal-code");
        registryCourt = printed(registryCourt, PREFIX + "registry-court");
        registryFile = printed(registryFile, PREFIX + "registry-file");
        issuePlace = printed(issuePlace, PREFIX + "issue-place");
        issuePlaceEn = printed(issuePlaceEn, PREFIX + "issue-place-en");
        firstYear = firstYear == null ? DEFAULT_FIRST_YEAR : firstYear;
        if (firstYear < FIRST_FOUR_DIGIT_YEAR || firstYear > LAST_FOUR_DIGIT_YEAR) {
            throw new IllegalArgumentException("RECEIPT_FIRST_YEAR (" + PREFIX + "first-year) must be a four-digit year, but is " + firstYear);
        }
    }

    public Year firstReceiptYear() {
        return Year.of(firstYear);
    }

    private static String printed(String value, String name) {
        PrintableText text = PrintableText.of(required(value, name));
        if (!text.prints()) {
            throw new IllegalArgumentException(name + " holds characters a receipt cannot print: " + text.outside().stream()
                    .map(codePoint -> String.format("U+%04X", codePoint)).collect(Collectors.joining(", ")));
        }
        return text.text();
    }

    private static String required(String value, String name) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(name + " is required");
        }
        return value.trim();
    }
}

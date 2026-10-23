package cz.novanadeje.app.operations.domain.settings;

import cz.novanadeje.app.shared.domain.EmailAddress;

import java.net.URI;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.Arrays;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Pattern;

public enum SettingFormat {
    TEXT {
        @Override
        Optional<SettingProblem> problemWith(String value) {
            return Optional.empty();
        }
    },
    URL {
        @Override
        Optional<SettingProblem> problemWith(String value) {
            try {
                URI uri = URI.create(value);
                boolean web = uri.getScheme() != null && WEB_SCHEMES.contains(uri.getScheme().toLowerCase(Locale.ROOT));
                boolean valid = web && uri.getHost() != null && !uri.getHost().isBlank() && uri.getRawQuery() == null && uri.getRawFragment() == null;
                return valid ? Optional.empty() : Optional.of(SettingProblem.INVALID_URL);
            } catch (IllegalArgumentException malformed) {
                return Optional.of(SettingProblem.INVALID_URL);
            }
        }
    },
    HOST {
        @Override
        Optional<SettingProblem> problemWith(String value) {
            return HOST_NAME.matcher(value).matches() ? Optional.empty() : Optional.of(SettingProblem.INVALID_HOST);
        }
    },
    HOST_LIST {
        @Override
        Optional<SettingProblem> problemWith(String value) {
            boolean valid = Arrays.stream(value.split(",", -1)).map(String::strip).allMatch(host -> HOST_NAME.matcher(host).matches());
            return valid ? Optional.empty() : Optional.of(SettingProblem.INVALID_HOST_LIST);
        }
    },
    PORT {
        @Override
        Optional<SettingProblem> problemWith(String value) {
            return wholeNumberBetween(value, 1, 65535) ? Optional.empty() : Optional.of(SettingProblem.INVALID_PORT);
        }
    },
    BOOLEAN {
        @Override
        Optional<SettingProblem> problemWith(String value) {
            return value.equals("true") || value.equals("false") ? Optional.empty() : Optional.of(SettingProblem.INVALID_BOOLEAN);
        }
    },
    EMAIL {
        @Override
        Optional<SettingProblem> problemWith(String value) {
            return EmailAddress.isValid(value) ? Optional.empty() : Optional.of(SettingProblem.INVALID_EMAIL);
        }
    },
    EMAIL_LIST {
        @Override
        Optional<SettingProblem> problemWith(String value) {
            boolean valid = Arrays.stream(value.split(",")).map(String::strip).allMatch(EmailAddress::isValid);
            return valid ? Optional.empty() : Optional.of(SettingProblem.INVALID_EMAIL_LIST);
        }
    },
    DATE {
        @Override
        Optional<SettingProblem> problemWith(String value) {
            try {
                LocalDate.parse(value);
                return Optional.empty();
            } catch (DateTimeParseException malformed) {
                return Optional.of(SettingProblem.INVALID_DATE);
            }
        }
    },
    YEAR {
        @Override
        Optional<SettingProblem> problemWith(String value) {
            return wholeNumberBetween(value, 2000, 2100) ? Optional.empty() : Optional.of(SettingProblem.INVALID_YEAR);
        }
    };

    private static final Set<String> WEB_SCHEMES = Set.of("http", "https");
    private static final Pattern HOST_NAME = Pattern.compile("[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?");
    private static final Pattern DIGITS = Pattern.compile("[0-9]{1,6}");

    abstract Optional<SettingProblem> problemWith(String value);

    private static boolean wholeNumberBetween(String value, int min, int max) {
        if (!DIGITS.matcher(value).matches()) {
            return false;
        }
        int number = Integer.parseInt(value);
        return number >= min && number <= max;
    }
}

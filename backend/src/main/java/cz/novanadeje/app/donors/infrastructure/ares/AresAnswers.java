package cz.novanadeje.app.donors.infrastructure.ares;

import cz.novanadeje.app.donors.application.CompanyRegistryUnavailable;
import cz.novanadeje.app.donors.domain.CompanyIdentifier;
import cz.novanadeje.app.donors.domain.RegisteredCompany;
import cz.novanadeje.app.shared.domain.PostalAddress;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.util.Optional;

final class AresAnswers {

    static final String UNEXPECTED = "unexpected response";

    private static final String CZECHIA = "CZ";
    private static final int REGISTRATION_NUMBER = 2;
    private static final int LOWEST_POSTAL_CODE = 10_000;
    private static final int HIGHEST_POSTAL_CODE = 99_999;

    private final JsonMapper mapper = JsonMapper.builder().build();

    RegisteredCompany parse(byte[] answer, CompanyIdentifier identifier) {
        JsonNode root;
        try {
            root = mapper.readTree(answer);
        } catch (JacksonException malformed) {
            throw new CompanyRegistryUnavailable(UNEXPECTED);
        }
        if (root == null || !root.isObject() || !identifier.value().equals(text(root, "ico").orElse(""))) {
            throw new CompanyRegistryUnavailable(UNEXPECTED);
        }
        String name = text(root, "obchodniJmeno").orElseThrow(() -> new CompanyRegistryUnavailable(UNEXPECTED));
        try {
            return new RegisteredCompany(identifier, name, seat(root.get("sidlo")));
        } catch (IllegalArgumentException invalid) {
            throw new CompanyRegistryUnavailable(UNEXPECTED);
        }
    }

    private static Optional<PostalAddress> seat(JsonNode seat) {
        if (seat == null || !seat.isObject() || !CZECHIA.equals(text(seat, "kodStatu").orElse(""))) {
            return Optional.empty();
        }
        Optional<String> place = text(seat, "nazevUlice").or(() -> text(seat, "nazevCastiObce"));
        Optional<String> city = text(seat, "nazevMestskehoObvodu").or(() -> text(seat, "nazevObce"));
        Optional<String> number = number(seat);
        Optional<String> postalCode = postalCode(seat);
        if (place.isEmpty() || city.isEmpty() || number.isEmpty() || postalCode.isEmpty()) {
            return Optional.empty();
        }
        try {
            return Optional.of(new PostalAddress(place.get() + " " + number.get(), city.get(), postalCode.get()));
        } catch (IllegalArgumentException invalid) {
            return Optional.empty();
        }
    }

    private static Optional<String> number(JsonNode seat) {
        JsonNode building = seat.get("cisloDomovni");
        if (building == null || !building.canConvertToInt()) {
            return Optional.empty();
        }
        JsonNode kind = seat.get("typCisloDomovni");
        String prefix = kind != null && kind.canConvertToInt() && kind.asInt() == REGISTRATION_NUMBER ? "č. ev. " : "";
        StringBuilder number = new StringBuilder(prefix).append(building.asInt());
        JsonNode orientation = seat.get("cisloOrientacni");
        if (orientation != null && orientation.canConvertToInt()) {
            number.append('/').append(orientation.asInt()).append(text(seat, "cisloOrientacniPismeno").orElse(""));
        }
        return Optional.of(number.toString());
    }

    private static Optional<String> postalCode(JsonNode seat) {
        JsonNode code = seat.get("psc");
        if (code == null || !code.canConvertToInt()) {
            return Optional.empty();
        }
        int digits = code.asInt();
        if (digits < LOWEST_POSTAL_CODE || digits > HIGHEST_POSTAL_CODE) {
            return Optional.empty();
        }
        String value = Integer.toString(digits);
        return Optional.of(value.substring(0, 3) + " " + value.substring(3));
    }

    private static Optional<String> text(JsonNode node, String field) {
        JsonNode value = node.get(field);
        if (value == null || !value.isString() || value.asString().isBlank()) {
            return Optional.empty();
        }
        return Optional.of(value.asString().trim());
    }
}

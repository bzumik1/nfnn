package cz.novanadeje.app.donors.domain;

import java.util.Arrays;
import java.util.EnumSet;
import java.util.Set;
import java.util.stream.Collectors;

public enum OAuthScope {
    ADMIN_READ("admin:read"),
    ADMIN_WRITE("admin:write");

    private final String value;

    OAuthScope(String value) {
        this.value = value;
    }

    public String value() {
        return value;
    }

    public static Set<OAuthScope> parse(String scope) {
        if (scope == null || scope.isBlank()) {
            throw new InvalidAuthorizationRequest("scope is required");
        }
        EnumSet<OAuthScope> parsed = EnumSet.noneOf(OAuthScope.class);
        for (String token : scope.trim().split("\\s+")) {
            parsed.add(Arrays.stream(values())
                    .filter(candidate -> candidate.value.equals(token))
                    .findFirst()
                    .orElseThrow(() -> new InvalidAuthorizationRequest("unknown scope")));
        }
        return Set.copyOf(parsed);
    }

    public static String format(Set<OAuthScope> scopes) {
        return Arrays.stream(values()).filter(scopes::contains).map(OAuthScope::value).collect(Collectors.joining(" "));
    }
}

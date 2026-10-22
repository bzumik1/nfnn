package cz.novanadeje.app.donors.interfaces.rest;

import cz.novanadeje.app.donors.domain.Role;
import cz.novanadeje.app.shared.infrastructure.security.JwtProperties;
import org.springframework.security.oauth2.jwt.Jwt;

import java.util.EnumSet;
import java.util.List;
import java.util.Set;

final class SessionRoles {

    private SessionRoles() {
    }

    static Set<Role> of(Jwt jwt) {
        List<String> names = jwt.getClaimAsStringList(JwtProperties.ROLES_CLAIM);
        EnumSet<Role> roles = EnumSet.noneOf(Role.class);
        if (names != null) {
            names.forEach(name -> roles.add(Role.valueOf(name)));
        }
        return Set.copyOf(roles);
    }

    static boolean secondFactorVerified(Jwt jwt) {
        return of(jwt).contains(Role.ADMIN);
    }
}

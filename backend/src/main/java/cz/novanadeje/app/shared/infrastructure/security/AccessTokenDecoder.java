package cz.novanadeje.app.shared.infrastructure.security;

import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtException;

public final class AccessTokenDecoder {

    private final JwtDecoder decoder;

    AccessTokenDecoder(JwtDecoder decoder) {
        this.decoder = decoder;
    }

    public Jwt decode(String token) throws JwtException {
        return decoder.decode(token);
    }
}

package cz.novanadeje.app.donors.infrastructure.persistence;

import cz.novanadeje.app.donors.domain.AuthorizationCode;
import cz.novanadeje.app.donors.domain.ClientId;
import cz.novanadeje.app.donors.domain.CodeChallenge;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.OAuthScope;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.net.URI;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "oauth_authorization_code")
public class AuthorizationCodeJpaEntity {

    @Id
    private UUID id;

    @Column(name = "secret_hash", nullable = false, length = 64, unique = true)
    private String secretHash;

    @Column(name = "donor_id", nullable = false)
    private UUID donorId;

    @Column(name = "client_id", nullable = false, length = 512)
    private String clientId;

    @Column(name = "redirect_uri", nullable = false, length = 2048)
    private String redirectUri;

    @Column(name = "code_challenge", nullable = false, length = 43)
    private String codeChallenge;

    @Column(name = "scope", nullable = false, length = 200)
    private String scope;

    @Column(name = "resource", nullable = false, length = 512)
    private String resource;

    @Column(name = "second_factor_verified", nullable = false)
    private boolean secondFactorVerified;

    @Column(name = "issued_at", nullable = false)
    private Instant issuedAt;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    @Column(name = "used_at")
    private Instant usedAt;

    protected AuthorizationCodeJpaEntity() {
    }

    static AuthorizationCodeJpaEntity fromDomain(AuthorizationCode code) {
        AuthorizationCodeJpaEntity entity = new AuthorizationCodeJpaEntity();
        entity.id = code.id();
        entity.secretHash = code.secretHash();
        entity.donorId = code.donorId().value();
        entity.clientId = code.clientId().value();
        entity.redirectUri = code.redirectUri().toString();
        entity.codeChallenge = code.codeChallenge().value();
        entity.scope = OAuthScope.format(code.scopes());
        entity.resource = code.resource();
        entity.secondFactorVerified = code.secondFactorVerified();
        entity.issuedAt = code.issuedAt();
        entity.expiresAt = code.expiresAt();
        entity.usedAt = code.usedAt().orElse(null);
        return entity;
    }

    AuthorizationCode toDomain() {
        return AuthorizationCode.reconstitute(id, secretHash, new DonorId(donorId), new ClientId(clientId), URI.create(redirectUri),
                new CodeChallenge(codeChallenge, CodeChallenge.S256), OAuthScope.parse(scope), resource, secondFactorVerified, issuedAt, expiresAt,
                usedAt);
    }
}

package cz.novanadeje.app.donors.domain;

import cz.novanadeje.app.shared.domain.UuidV7;

import java.net.URI;
import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

public final class AuthorizationCode {

    private final UUID id;
    private final String secretHash;
    private final DonorId donorId;
    private final ClientId clientId;
    private final URI redirectUri;
    private final CodeChallenge codeChallenge;
    private final Set<OAuthScope> scopes;
    private final String resource;
    private final boolean secondFactorVerified;
    private final Instant issuedAt;
    private final Instant expiresAt;
    private Instant usedAt;

    private AuthorizationCode(UUID id, String secretHash, DonorId donorId, ClientId clientId, URI redirectUri, CodeChallenge codeChallenge,
                              Set<OAuthScope> scopes, String resource, boolean secondFactorVerified, Instant issuedAt, Instant expiresAt,
                              Instant usedAt) {
        this.id = id;
        this.secretHash = secretHash;
        this.donorId = donorId;
        this.clientId = clientId;
        this.redirectUri = redirectUri;
        this.codeChallenge = codeChallenge;
        this.scopes = Set.copyOf(scopes);
        this.resource = resource;
        this.secondFactorVerified = secondFactorVerified;
        this.issuedAt = issuedAt;
        this.expiresAt = expiresAt;
        this.usedAt = usedAt;
    }

    public static AuthorizationCode issue(LinkSecret secret, DonorId donorId, ClientId clientId, URI redirectUri, CodeChallenge codeChallenge,
                                          Set<OAuthScope> scopes, String resource, boolean secondFactorVerified, Instant issuedAt, Duration lifetime) {
        return new AuthorizationCode(UuidV7.generate(issuedAt), secret.hash(), donorId, clientId, redirectUri, codeChallenge, scopes, resource,
                secondFactorVerified, issuedAt, issuedAt.plus(lifetime), null);
    }

    public static AuthorizationCode reconstitute(UUID id, String secretHash, DonorId donorId, ClientId clientId, URI redirectUri,
                                                 CodeChallenge codeChallenge, Set<OAuthScope> scopes, String resource, boolean secondFactorVerified,
                                                 Instant issuedAt, Instant expiresAt, Instant usedAt) {
        return new AuthorizationCode(id, secretHash, donorId, clientId, redirectUri, codeChallenge, scopes, resource, secondFactorVerified, issuedAt,
                expiresAt, usedAt);
    }

    public boolean isUsableAt(Instant now) {
        return usedAt == null && now.isBefore(expiresAt);
    }

    public boolean belongsTo(ClientId presentedClient, URI presentedRedirect) {
        return clientId.equals(presentedClient) && redirectUri.equals(presentedRedirect);
    }

    public boolean verifies(String codeVerifier) {
        return codeChallenge.matches(codeVerifier);
    }

    public void markUsed(Instant at) {
        if (usedAt == null) {
            usedAt = at;
        }
    }

    public UUID id() {
        return id;
    }

    public String secretHash() {
        return secretHash;
    }

    public DonorId donorId() {
        return donorId;
    }

    public ClientId clientId() {
        return clientId;
    }

    public URI redirectUri() {
        return redirectUri;
    }

    public CodeChallenge codeChallenge() {
        return codeChallenge;
    }

    public Set<OAuthScope> scopes() {
        return scopes;
    }

    public String resource() {
        return resource;
    }

    public boolean secondFactorVerified() {
        return secondFactorVerified;
    }

    public Instant issuedAt() {
        return issuedAt;
    }

    public Instant expiresAt() {
        return expiresAt;
    }

    public Optional<Instant> usedAt() {
        return Optional.ofNullable(usedAt);
    }
}

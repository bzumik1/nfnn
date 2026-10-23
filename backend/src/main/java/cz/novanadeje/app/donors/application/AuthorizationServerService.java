package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.AdministratorRequired;
import cz.novanadeje.app.donors.domain.AuthorizationCode;
import cz.novanadeje.app.donors.domain.AuthorizationCodeRepository;
import cz.novanadeje.app.donors.domain.ClientId;
import cz.novanadeje.app.donors.domain.ClientMetadata;
import cz.novanadeje.app.donors.domain.CodeChallenge;
import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.DonorRepository;
import cz.novanadeje.app.donors.domain.InvalidAuthorizationRequest;
import cz.novanadeje.app.donors.domain.InvalidClient;
import cz.novanadeje.app.donors.domain.InvalidGrant;
import cz.novanadeje.app.donors.domain.InvalidTarget;
import cz.novanadeje.app.donors.domain.LinkSecret;
import cz.novanadeje.app.donors.domain.OAuthScope;
import cz.novanadeje.app.donors.domain.RefreshToken;
import cz.novanadeje.app.donors.domain.RefreshTokenRepository;
import cz.novanadeje.app.donors.domain.RefreshTokenSecret;
import cz.novanadeje.app.donors.domain.Role;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.net.URI;
import java.net.URISyntaxException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class AuthorizationServerService {

    private static final Logger log = LoggerFactory.getLogger(AuthorizationServerService.class);
    private static final String CODE_RESPONSE = "code";
    private static final String ACCESS_DENIED = "access_denied";

    private final ClientMetadataSource clients;
    private final AuthorizationCodeRepository codes;
    private final RefreshTokenRepository refreshTokens;
    private final DonorRepository donors;
    private final AccessTokenIssuer accessTokens;
    private final AccessTokenVerifier accessTokenVerifier;
    private final OAuthProperties properties;
    private final DonorSessionProperties sessionProperties;
    private final Clock clock;

    public AuthorizationServerService(ClientMetadataSource clients, AuthorizationCodeRepository codes, RefreshTokenRepository refreshTokens,
                                      DonorRepository donors, AccessTokenIssuer accessTokens, AccessTokenVerifier accessTokenVerifier,
                                      OAuthProperties properties, DonorSessionProperties sessionProperties, Clock clock) {
        this.clients = clients;
        this.codes = codes;
        this.refreshTokens = refreshTokens;
        this.donors = donors;
        this.accessTokens = accessTokens;
        this.accessTokenVerifier = accessTokenVerifier;
        this.properties = properties;
        this.sessionProperties = sessionProperties;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public ClientDescription describeClient(String clientId, String redirectUri) {
        ClientMetadata metadata = clients.fetch(new ClientId(clientId));
        URI redirect = registeredRedirect(metadata, redirectUri);
        return new ClientDescription(metadata.clientId().host(), metadata.displayName(), ClientMetadata.isLoopback(redirect));
    }

    @Transactional
    public URI decide(AuthorizationDecision decision, DonorId donorId, Set<Role> sessionRoles) {
        ClientId clientId = new ClientId(decision.clientId());
        ClientMetadata metadata = clients.fetch(clientId);
        URI redirect = registeredRedirect(metadata, decision.redirectUri());
        if (!decision.approved()) {
            log.info("Donor {} declined the connection of client {}", donorId, clientId.host());
            return redirectTo(redirect, Map.of("error", ACCESS_DENIED), decision.state());
        }
        if (!sessionRoles.contains(Role.ADMIN)) {
            throw new AdministratorRequired(donorId);
        }
        if (!CODE_RESPONSE.equals(decision.responseType())) {
            throw new InvalidAuthorizationRequest("response_type must be code");
        }
        CodeChallenge challenge = new CodeChallenge(decision.codeChallenge(), decision.codeChallengeMethod());
        Set<OAuthScope> scopes = OAuthScope.parse(decision.scope());
        if (!properties.mcpResource().equals(decision.resource())) {
            throw new InvalidAuthorizationRequest("resource must be " + properties.mcpResource());
        }
        Instant now = clock.instant();
        LinkSecret secret = LinkSecret.generate();
        codes.save(AuthorizationCode.issue(secret, donorId, clientId, redirect, challenge, scopes, properties.mcpResource(), true, now,
                properties.authorizationCodeTtl()));
        log.info("Donor {} approved the connection of client {} with scope {}", donorId, clientId.host(), OAuthScope.format(scopes));
        return redirectTo(redirect, Map.of(CODE_RESPONSE, secret.value()), decision.state());
    }

    @Transactional(noRollbackFor = {InvalidGrant.class, InvalidTarget.class})
    public OAuthTokens exchangeCode(CodeExchange exchange) {
        Instant now = clock.instant();
        LinkSecret secret;
        ClientId clientId;
        URI redirect;
        try {
            secret = new LinkSecret(exchange.code());
            clientId = new ClientId(exchange.clientId());
            redirect = new URI(exchange.redirectUri());
        } catch (IllegalArgumentException | URISyntaxException | NullPointerException malformed) {
            throw new InvalidGrant("the code, the client or the redirect address is malformed");
        }
        AuthorizationCode code = codes.findBySecretHash(secret.hash()).orElseThrow(() -> new InvalidGrant("unknown code"));
        if (!code.isUsableAt(now)) {
            throw new InvalidGrant("the code expired or was used");
        }
        if (!codes.markUsed(code.id(), now)) {
            throw new InvalidGrant("the code expired or was used");
        }
        if (!code.belongsTo(clientId, redirect)) {
            throw new InvalidGrant("the code belongs to another client or redirect address");
        }
        if (!code.verifies(exchange.codeVerifier())) {
            throw new InvalidGrant("the code verifier does not match");
        }
        if (exchange.resource() != null && !exchange.resource().equals(code.resource())) {
            throw new InvalidTarget(exchange.resource());
        }
        Donor donor = donors.findById(code.donorId()).filter(found -> !found.isErased()).orElseThrow(() -> new InvalidGrant("unknown donor"));
        log.info("Client {} exchanged a code of donor {}", clientId.host(), donor.id());
        return issue(donor, clientId, code.scopes(), code.resource(), code.secondFactorVerified(), now, now);
    }

    @Transactional(noRollbackFor = InvalidGrant.class)
    public OAuthTokens refresh(String presentedSecret, String presentedClientId) {
        Instant now = clock.instant();
        ClientId clientId;
        RefreshToken token;
        try {
            clientId = new ClientId(presentedClientId);
            token = refreshTokens.findBySecretHash(RefreshTokenSecret.fromValue(presentedSecret).hash())
                    .orElseThrow(() -> new InvalidGrant("unknown refresh token"));
        } catch (IllegalArgumentException malformed) {
            throw new InvalidGrant("the refresh token or the client is malformed");
        }
        if (token.isUsed()) {
            refreshTokens.revokeAllOf(token.donorId(), now);
            log.warn("A used refresh token of donor {} was presented by a client; every session of the donor is ended", token.donorId());
            throw new InvalidGrant("the refresh token was used before");
        }
        if (!token.isUsableAt(now) || !token.belongsToClient(clientId)) {
            throw new InvalidGrant("the refresh token expired, was revoked or belongs to another client");
        }
        Donor donor = donors.findById(token.donorId()).filter(found -> !found.isErased()).orElseThrow(() -> new InvalidGrant("unknown donor"));
        if (!donor.isAdministrator()) {
            token.revoke(now);
            refreshTokens.save(token);
            log.info("Donor {} is no administrator any more; the connection of client {} ends", donor.id(), clientId.host());
            throw new InvalidGrant("the donor is no administrator any more");
        }
        if (!refreshTokens.markUsed(token.id(), now)) {
            refreshTokens.revokeAllOf(token.donorId(), now);
            log.warn("A refresh token of donor {} was presented twice at once by a client; every session of the donor is ended", token.donorId());
            throw new InvalidGrant("the refresh token was used before");
        }
        return issue(donor, clientId, token.scopes(), properties.mcpResource(), token.secondFactorVerified(), token.grantedAt(), now);
    }

    @Transactional(readOnly = true)
    public ExchangedAccessToken exchangeToken(String subjectToken, String resource) {
        if (!properties.apiResource().equals(resource)) {
            throw new InvalidTarget(resource);
        }
        VerifiedAccessToken subject = accessTokenVerifier.verify(subjectToken);
        if (!subject.audiences().contains(properties.mcpResource())) {
            throw new InvalidGrant("the subject token was not issued for the connector");
        }
        Donor donor = donors.findById(subject.donorId()).filter(found -> !found.isErased()).orElseThrow(() -> new InvalidGrant("unknown donor"));
        Instant now = clock.instant();
        IssuedAccessToken issued = accessTokens.issue(new AccessTokenGrant(donor.id(), donor.sessionRoles(true), properties.apiResource(),
                subject.scopes(), now, subject.expiresAt(), subject.client()));
        log.info("The connector exchanged a token of donor {} for an API token", donor.id());
        return new ExchangedAccessToken(issued.token(), issued.expiresAt(), subject.scopes());
    }

    private OAuthTokens issue(Donor donor, ClientId clientId, Set<OAuthScope> scopes, String audience, boolean secondFactorVerified, Instant grantedAt,
                              Instant now) {
        IssuedAccessToken access = accessTokens.issue(new AccessTokenGrant(donor.id(), donor.sessionRoles(secondFactorVerified), audience, scopes, now,
                null, clientId.host()));
        RefreshTokenSecret secret = RefreshTokenSecret.generate();
        refreshTokens.save(RefreshToken.issueForClient(secret, donor.id(), clientId, scopes, grantedAt, now, sessionProperties.refreshTokenTtl()));
        return new OAuthTokens(access.token(), access.expiresAt(), secret.value(), scopes);
    }

    private static URI registeredRedirect(ClientMetadata metadata, String redirectUri) {
        URI redirect;
        try {
            redirect = new URI(redirectUri == null ? "" : redirectUri);
        } catch (URISyntaxException malformed) {
            throw new InvalidClient("redirect_uri is not a valid address");
        }
        if (!metadata.allowsRedirect(redirect)) {
            throw new InvalidClient("redirect_uri is not registered for the client");
        }
        return redirect;
    }

    private URI redirectTo(URI redirect, Map<String, String> parameters, String state) {
        Map<String, String> query = new LinkedHashMap<>(parameters);
        if (state != null && !state.isBlank()) {
            query.put("state", state);
        }
        query.put("iss", properties.issuer());
        String encoded = query.entrySet().stream()
                .map(entry -> entry.getKey() + "=" + URLEncoder.encode(entry.getValue(), StandardCharsets.UTF_8))
                .collect(Collectors.joining("&"));
        String separator = redirect.getRawQuery() == null ? "?" : "&";
        return URI.create(redirect + separator + encoded);
    }
}

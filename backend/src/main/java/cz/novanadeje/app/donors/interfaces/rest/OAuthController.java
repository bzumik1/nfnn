package cz.novanadeje.app.donors.interfaces.rest;

import cz.novanadeje.app.donors.application.AuthorizationServerService;
import cz.novanadeje.app.donors.application.CodeExchange;
import cz.novanadeje.app.donors.application.ExchangedAccessToken;
import cz.novanadeje.app.donors.application.OAuthTokens;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.InvalidAuthorizationRequest;
import cz.novanadeje.app.donors.domain.InvalidClient;
import cz.novanadeje.app.donors.domain.InvalidGrant;
import cz.novanadeje.app.donors.domain.InvalidTarget;
import cz.novanadeje.app.shared.domain.error.DomainException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.util.MultiValueMap;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Clock;

@RestController
@RequestMapping("/api/donors/oauth")
class OAuthController {

    static final String AUTHORIZATION_CODE = "authorization_code";
    static final String REFRESH_TOKEN = "refresh_token";
    static final String TOKEN_EXCHANGE = "urn:ietf:params:oauth:grant-type:token-exchange";
    private static final int MAX_PARAMETER_LENGTH = 4096;

    private final AuthorizationServerService authorizationServer;
    private final OAuthTokenRateLimiter rateLimiter;
    private final Clock clock;

    OAuthController(AuthorizationServerService authorizationServer, OAuthTokenRateLimiter rateLimiter, Clock clock) {
        this.authorizationServer = authorizationServer;
        this.rateLimiter = rateLimiter;
        this.clock = clock;
    }

    @GetMapping("/client")
    ClientDescriptionResponse describeClient(@RequestParam @NotBlank @Size(max = MAX_PARAMETER_LENGTH) String clientId,
                                             @RequestParam @NotBlank @Size(max = MAX_PARAMETER_LENGTH) String redirectUri) {
        return ClientDescriptionResponse.of(authorizationServer.describeClient(clientId, redirectUri));
    }

    @PostMapping("/authorize")
    RedirectResponse authorize(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody AuthorizationRequest request) {
        return new RedirectResponse(authorizationServer.decide(request.toDecision(), DonorId.of(jwt.getSubject()), SessionRoles.of(jwt)).toString());
    }

    @PostMapping(path = "/token", consumes = MediaType.APPLICATION_FORM_URLENCODED_VALUE)
    ResponseEntity<?> token(@RequestParam MultiValueMap<String, String> form, HttpServletRequest http) {
        rateLimiter.check(http.getRemoteAddr());
        String grantType = first(form, "grant_type");
        try {
            TokenResponse response = switch (grantType == null ? "" : grantType) {
                case AUTHORIZATION_CODE -> TokenResponse.of(exchangeCode(form), clock.instant());
                case REFRESH_TOKEN -> TokenResponse.of(authorizationServer.refresh(first(form, REFRESH_TOKEN), first(form, "client_id")), clock.instant());
                case TOKEN_EXCHANGE -> exchangeToken(form);
                default -> throw new UnsupportedGrantType();
            };
            return noStore(HttpStatus.OK).body(response);
        } catch (UnsupportedGrantType unsupported) {
            return noStore(HttpStatus.BAD_REQUEST).body(new TokenErrorResponse("unsupported_grant_type", "grant_type is not supported"));
        } catch (InvalidGrant | InvalidClient | InvalidTarget | InvalidAuthorizationRequest refused) {
            return noStore(HttpStatus.BAD_REQUEST).body(new TokenErrorResponse(errorCode(refused), refused.getMessage()));
        }
    }

    private OAuthTokens exchangeCode(MultiValueMap<String, String> form) {
        return authorizationServer.exchangeCode(new CodeExchange(first(form, "code"), first(form, "client_id"), first(form, "redirect_uri"),
                first(form, "code_verifier"), first(form, "resource")));
    }

    private TokenResponse exchangeToken(MultiValueMap<String, String> form) {
        ExchangedAccessToken token = authorizationServer.exchangeToken(first(form, "subject_token"), first(form, "resource"));
        return TokenResponse.exchanged(token, clock.instant());
    }

    private static String errorCode(DomainException refused) {
        return switch (refused) {
            case InvalidGrant grant -> "invalid_grant";
            case InvalidClient client -> "invalid_client";
            case InvalidTarget target -> "invalid_target";
            default -> "invalid_request";
        };
    }

    private static String first(MultiValueMap<String, String> form, String name) {
        String value = form.getFirst(name);
        if (value != null && value.length() > MAX_PARAMETER_LENGTH) {
            throw new InvalidGrant(name + " is too long");
        }
        return value;
    }

    private static ResponseEntity.BodyBuilder noStore(HttpStatus status) {
        return ResponseEntity.status(status).cacheControl(CacheControl.noStore()).header("Pragma", "no-cache");
    }

    private static final class UnsupportedGrantType extends RuntimeException {
    }
}

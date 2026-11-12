package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.application.banklogo.PublicBankLogoService;
import cz.novanadeje.app.donations.domain.banklogo.BankLogoImageId;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Duration;
import java.util.UUID;

@RestController
@RequestMapping("/api/donations/bank-logos")
class BankLogosController {

    static final String LIST_CACHE_CONTROL = "private, max-age=300";
    private static final MediaType WEBP = MediaType.parseMediaType("image/webp");
    private static final CacheControl FOREVER = CacheControl.maxAge(Duration.ofDays(365)).cachePublic().immutable();

    private final PublicBankLogoService logos;
    private final BankLogoRateLimiter rateLimiter;

    BankLogosController(PublicBankLogoService logos, BankLogoRateLimiter rateLimiter) {
        this.logos = logos;
        this.rateLimiter = rateLimiter;
    }

    @GetMapping
    ResponseEntity<BankLogosResponse> list(HttpServletRequest http) {
        rateLimiter.check(http.getRemoteAddr());
        return ResponseEntity.ok().header(HttpHeaders.CACHE_CONTROL, LIST_CACHE_CONTROL).body(BankLogosResponse.from(logos.published()));
    }

    @GetMapping("/images/{imageId}")
    ResponseEntity<byte[]> image(HttpServletRequest http, @PathVariable UUID imageId) {
        rateLimiter.check(http.getRemoteAddr());
        return ResponseEntity.ok().contentType(WEBP).cacheControl(FOREVER).body(logos.image(new BankLogoImageId(imageId)));
    }
}

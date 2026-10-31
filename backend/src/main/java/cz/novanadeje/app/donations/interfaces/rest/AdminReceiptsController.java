package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.application.receipt.AdminReceiptView;
import cz.novanadeje.app.donations.application.receipt.AdminReceiptsService;
import cz.novanadeje.app.donations.application.receipt.AdministrationChannel;
import cz.novanadeje.app.donations.domain.donation.DonationId;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.donations.domain.receipt.ContentDigest;
import cz.novanadeje.app.donations.domain.receipt.DonationReceipt;
import cz.novanadeje.app.donations.domain.receipt.DonationReceiptId;
import cz.novanadeje.app.donations.domain.receipt.ReceiptQuery;
import cz.novanadeje.app.donations.domain.receipt.StoredReceiptImage;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Pattern;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Year;
import java.util.Optional;
import java.util.UUID;

import static cz.novanadeje.app.donations.interfaces.rest.DonorDonationsController.FIRST_FOUR_DIGIT_YEAR;
import static cz.novanadeje.app.donations.interfaces.rest.DonorDonationsController.LAST_FOUR_DIGIT_YEAR;

@RestController
@RequestMapping("/api/admin/donations")
class AdminReceiptsController {

    static final int DEFAULT_LIMIT = 50;
    private static final String SCOPE_CLAIM = "scope";
    private static final String NOT_STORED_BY_ANY_CACHE = "private, no-store";
    private static final String KEPT_BY_THE_BROWSER = "private, max-age=31536000, immutable";

    private final AdminReceiptsService receipts;

    AdminReceiptsController(AdminReceiptsService receipts) {
        this.receipts = receipts;
    }

    @GetMapping("/receipts")
    ResponseEntity<AdminReceiptListResponse> list(
            @RequestParam(required = false) UUID donorId,
            @RequestParam(required = false) @Min(FIRST_FOUR_DIGIT_YEAR) @Max(LAST_FOUR_DIGIT_YEAR) Integer issuedIn,
            @RequestParam(defaultValue = "0") @Min(0) @Max(ReceiptQuery.MAX_PAGE) int page,
            @RequestParam(defaultValue = "" + DEFAULT_LIMIT) @Min(1) @Max(ReceiptQuery.MAX_LIMIT) int limit
    ) {
        ReceiptQuery query = new ReceiptQuery(Optional.ofNullable(donorId).map(DonorReference::new), Optional.ofNullable(issuedIn).map(Year::of),
                page, limit);
        return notStored(AdminReceiptListResponse.from(receipts.receipts(query), page, limit));
    }

    @GetMapping("/receipts/{id}")
    ResponseEntity<AdminReceiptResponse> receipt(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        AdminReceiptView view = receipts.receipt(new DonationReceiptId(id));
        return notStored(view.donorErased() && channelOf(jwt) == AdministrationChannel.CONNECTED_APPLICATION
                ? AdminReceiptResponse.withoutErasedDonor(view.receipt())
                : AdminReceiptResponse.asIssued(view.receipt(), view.donorErased()));
    }

    @GetMapping("/receipt-images/{sha256}")
    ResponseEntity<byte[]> image(@PathVariable @Pattern(regexp = "[0-9a-f]{64}") String sha256) {
        StoredReceiptImage image = receipts.signatureImage(new ContentDigest(sha256));
        byte[] content = image.content();
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(image.mediaType()))
                .contentLength(content.length)
                .header(HttpHeaders.CACHE_CONTROL, KEPT_BY_THE_BROWSER)
                .body(content);
    }

    @PostMapping("/donors/{donorId}/receipts")
    ResponseEntity<AdminReceiptResponse> issue(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID donorId,
                                               @Valid @RequestBody ReceiptIssueRequest request) {
        UUID admin = UUID.fromString(jwt.getSubject());
        AdministrationChannel channel = channelOf(jwt);
        DonorReference donor = new DonorReference(donorId);
        DonationReceipt receipt = request.year() != null
                ? receipts.issueForYear(admin, channel, donor, Year.of(request.year()))
                : receipts.issueForDonation(admin, channel, donor, new DonationId(UUID.fromString(request.donationId())));
        return notStored(AdminReceiptResponse.ofLiveDonor(receipt));
    }

    private static AdministrationChannel channelOf(Jwt jwt) {
        return jwt.hasClaim(SCOPE_CLAIM) ? AdministrationChannel.CONNECTED_APPLICATION : AdministrationChannel.BROWSER;
    }

    private static <T> ResponseEntity<T> notStored(T body) {
        return ResponseEntity.ok().header(HttpHeaders.CACHE_CONTROL, NOT_STORED_BY_ANY_CACHE).body(body);
    }
}

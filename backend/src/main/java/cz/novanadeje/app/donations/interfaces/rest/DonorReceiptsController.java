package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.application.receipt.DonationReceiptService;
import cz.novanadeje.app.donations.application.receipt.DonorReceiptsService;
import cz.novanadeje.app.donations.domain.donation.DonationId;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.donations.domain.receipt.ContentDigest;
import cz.novanadeje.app.donations.domain.receipt.DonationReceipt;
import cz.novanadeje.app.donations.domain.receipt.DonationReceiptId;
import cz.novanadeje.app.donations.domain.receipt.StoredReceiptImage;
import jakarta.validation.Valid;
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
import org.springframework.web.bind.annotation.RestController;

import java.time.Year;
import java.util.UUID;

@RestController
@RequestMapping("/api/donations/me")
class DonorReceiptsController {

    private static final String NOT_STORED_BY_ANY_CACHE = "private, no-store";
    private static final String KEPT_BY_THE_BROWSER = "private, max-age=31536000, immutable";

    private final DonationReceiptService issuance;
    private final DonorReceiptsService receipts;

    DonorReceiptsController(DonationReceiptService issuance, DonorReceiptsService receipts) {
        this.issuance = issuance;
        this.receipts = receipts;
    }

    @PostMapping("/receipts")
    ResponseEntity<DonorReceiptResponse> issue(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody ReceiptIssueRequest request) {
        DonorReference donor = caller(jwt);
        DonationReceipt receipt = request.year() != null
                ? issuance.issueForYear(donor, Year.of(request.year()))
                : issuance.issueForDonation(donor, new DonationId(UUID.fromString(request.donationId())));
        return notStored(DonorReceiptResponse.from(receipt));
    }

    @GetMapping("/receipts")
    ResponseEntity<DonorReceiptsResponse> list(@AuthenticationPrincipal Jwt jwt) {
        return notStored(new DonorReceiptsResponse(receipts.receiptsOf(caller(jwt)).stream().map(DonorReceiptResponse::from).toList()));
    }

    @GetMapping("/receipts/{id}")
    ResponseEntity<DonorReceiptResponse> receipt(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        return notStored(DonorReceiptResponse.from(receipts.receiptOf(caller(jwt), new DonationReceiptId(id))));
    }

    @GetMapping("/receipt-images/{sha256}")
    ResponseEntity<byte[]> image(@AuthenticationPrincipal Jwt jwt, @PathVariable @Pattern(regexp = "[0-9a-f]{64}") String sha256) {
        StoredReceiptImage image = receipts.signatureImageOf(caller(jwt), new ContentDigest(sha256));
        byte[] content = image.content();
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(image.mediaType()))
                .contentLength(content.length)
                .header(HttpHeaders.CACHE_CONTROL, KEPT_BY_THE_BROWSER)
                .body(content);
    }

    private static <T> ResponseEntity<T> notStored(T body) {
        return ResponseEntity.ok().header(HttpHeaders.CACHE_CONTROL, NOT_STORED_BY_ANY_CACHE).body(body);
    }

    private static DonorReference caller(Jwt jwt) {
        return DonorReference.of(jwt.getSubject());
    }
}

package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.application.receipt.DonationReceiptService;
import cz.novanadeje.app.donations.application.receipt.IssuedReceipt;
import cz.novanadeje.app.donations.domain.donation.DonationId;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import org.springframework.context.MessageSource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.nio.charset.StandardCharsets;
import java.time.Year;
import java.util.UUID;

import static cz.novanadeje.app.donations.interfaces.rest.DonorDonationsController.FIRST_FOUR_DIGIT_YEAR;
import static cz.novanadeje.app.donations.interfaces.rest.DonorDonationsController.LAST_FOUR_DIGIT_YEAR;

@RestController
@RequestMapping("/api/donations/me")
class DonationReceiptController {

    private static final String SINGLE_FILE_NAME_KEY = "receipt.fileName.single";
    private static final String YEARLY_FILE_NAME_KEY = "receipt.fileName.yearly";
    private static final String NOT_STORED_BY_ANY_CACHE = "private, no-store";

    private final DonationReceiptService receipts;
    private final MessageSource messages;
    private final ReceiptIssuanceRateLimiter rateLimiter;

    DonationReceiptController(DonationReceiptService receipts, MessageSource messages, ReceiptIssuanceRateLimiter rateLimiter) {
        this.receipts = receipts;
        this.messages = messages;
        this.rateLimiter = rateLimiter;
    }

    @GetMapping("/{id}/receipt")
    ResponseEntity<byte[]> singleReceipt(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, HttpServletRequest http) {
        rateLimiter.check(http.getRemoteAddr());
        IssuedReceipt receipt = receipts.singleReceipt(caller(jwt), new DonationId(id));
        return pdf(receipt, fileName(SINGLE_FILE_NAME_KEY, receipt.number().value(), receipt));
    }

    @GetMapping("/receipts/yearly")
    ResponseEntity<byte[]> yearlyReceipt(
            @AuthenticationPrincipal Jwt jwt,
            @RequestParam @Min(FIRST_FOUR_DIGIT_YEAR) @Max(LAST_FOUR_DIGIT_YEAR) int year,
            HttpServletRequest http
    ) {
        rateLimiter.check(http.getRemoteAddr());
        IssuedReceipt receipt = receipts.yearlyReceipt(caller(jwt), Year.of(year));
        return pdf(receipt, fileName(YEARLY_FILE_NAME_KEY, String.valueOf(year), receipt));
    }

    private String fileName(String key, String argument, IssuedReceipt receipt) {
        return messages.getMessage(key, new Object[]{argument}, receipt.locale().toLocale());
    }

    private static ResponseEntity<byte[]> pdf(IssuedReceipt receipt, String fileName) {
        byte[] content = receipt.content();
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_PDF)
                .contentLength(content.length)
                .header(HttpHeaders.CACHE_CONTROL, NOT_STORED_BY_ANY_CACHE)
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment().filename(fileName, StandardCharsets.UTF_8).build().toString())
                .body(content);
    }

    private static DonorReference caller(Jwt jwt) {
        return DonorReference.of(jwt.getSubject());
    }
}

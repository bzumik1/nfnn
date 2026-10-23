package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.application.admin.AdminPaymentsService;
import cz.novanadeje.app.donations.application.admin.PaymentFilter;
import cz.novanadeje.app.donations.application.pairing.ManualPairingService;
import cz.novanadeje.app.donations.domain.bank.BankPaymentId;
import cz.novanadeje.app.donations.domain.donor.DonorRecord;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.time.Year;
import java.util.Optional;
import java.util.UUID;

@RestController
@RequestMapping("/api/admin/donations")
class AdminPaymentsController {

    static final String UNPAIRED = "unpaired";
    static final String PAIRED = "paired";
    private static final int FIRST_FOUR_DIGIT_YEAR = 1000;
    private static final int LAST_FOUR_DIGIT_YEAR = 9999;

    private final AdminPaymentsService adminPayments;
    private final ManualPairingService manualPairing;

    AdminPaymentsController(AdminPaymentsService adminPayments, ManualPairingService manualPairing) {
        this.adminPayments = adminPayments;
        this.manualPairing = manualPairing;
    }

    @GetMapping("/payments")
    AdminPaymentListResponse payments(
            @RequestParam(defaultValue = UNPAIRED) @Pattern(regexp = UNPAIRED + "|" + PAIRED) String pairing,
            @RequestParam(required = false) @Min(FIRST_FOUR_DIGIT_YEAR) @Max(LAST_FOUR_DIGIT_YEAR) Integer year,
            @RequestParam(required = false) @Size(max = PaymentFilter.MAX_TEXT_LENGTH) String query,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) UUID donorId,
            @RequestParam(defaultValue = "0") @Min(0) int offset,
            @RequestParam(required = false) @Min(1) @Max(PaymentFilter.MAX_LIMIT) Integer limit
    ) {
        PaymentFilter filter = new PaymentFilter(query, from, to, donorId == null ? null : new DonorReference(donorId), offset, limit);
        if (PAIRED.equals(pairing)) {
            return AdminPaymentListResponse.from(adminPayments.listPaired(Optional.ofNullable(year).map(Year::of), filter));
        }
        return AdminPaymentListResponse.from(adminPayments.listUnpaired(filter));
    }

    @GetMapping("/donors")
    AdminDonorSearchResponse donors(@RequestParam(defaultValue = "") @Size(max = DonorRecord.MAX_NAME_LENGTH) String query) {
        return AdminDonorSearchResponse.from(adminPayments.searchDonors(query));
    }

    @PostMapping("/payments/{id}/pair")
    PairPaymentResponse pair(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody PairPaymentRequest request) {
        return PairPaymentResponse.from(manualPairing.pair(admin(jwt), new BankPaymentId(id), new DonorReference(request.donorId())));
    }

    @PostMapping("/payments/{id}/unpair")
    UnpairPaymentResponse unpair(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        return UnpairPaymentResponse.from(manualPairing.unpair(admin(jwt), new BankPaymentId(id)));
    }

    private static UUID admin(Jwt jwt) {
        return UUID.fromString(jwt.getSubject());
    }
}

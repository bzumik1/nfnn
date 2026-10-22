package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.application.admin.AdminPaymentsService;
import cz.novanadeje.app.donations.application.pairing.ManualPairingService;
import cz.novanadeje.app.donations.domain.bank.BankPaymentId;
import cz.novanadeje.app.donations.domain.donor.DonorRecord;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
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
            @RequestParam(required = false) @Min(FIRST_FOUR_DIGIT_YEAR) @Max(LAST_FOUR_DIGIT_YEAR) Integer year
    ) {
        if (PAIRED.equals(pairing)) {
            return AdminPaymentListResponse.from(adminPayments.listPaired(Optional.ofNullable(year).map(Year::of)));
        }
        return AdminPaymentListResponse.from(adminPayments.listUnpaired());
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

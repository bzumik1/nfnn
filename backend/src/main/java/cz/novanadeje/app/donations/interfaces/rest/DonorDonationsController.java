package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.application.overview.DonorDonationsService;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import org.springframework.context.MessageSource;
import org.springframework.context.i18n.LocaleContextHolder;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Year;
import java.util.Optional;

@RestController
@RequestMapping("/api/donations/me")
class DonorDonationsController {

    static final int FIRST_FOUR_DIGIT_YEAR = 1000;
    static final int LAST_FOUR_DIGIT_YEAR = 9999;
    private static final String GENERAL_PURPOSE_KEY = "donation.purpose.general";

    private final DonorDonationsService donorDonations;
    private final MessageSource messages;

    DonorDonationsController(DonorDonationsService donorDonations, MessageSource messages) {
        this.donorDonations = donorDonations;
        this.messages = messages;
    }

    @GetMapping
    DonationListResponse donations(
            @AuthenticationPrincipal Jwt jwt,
            @RequestParam(required = false) @Min(FIRST_FOUR_DIGIT_YEAR) @Max(LAST_FOUR_DIGIT_YEAR) Integer year
    ) {
        Optional<Year> receiptYear = Optional.ofNullable(year).map(Year::of);
        return DonationListResponse.from(donorDonations.listDonations(caller(jwt), receiptYear), generalPurpose());
    }

    @GetMapping("/summary")
    DonationSummaryResponse summary(@AuthenticationPrincipal Jwt jwt) {
        return DonationSummaryResponse.from(donorDonations.summarizeDonations(caller(jwt)));
    }

    private String generalPurpose() {
        return messages.getMessage(GENERAL_PURPOSE_KEY, null, LocaleContextHolder.getLocale());
    }

    private static DonorReference caller(Jwt jwt) {
        return DonorReference.of(jwt.getSubject());
    }
}

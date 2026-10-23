package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.application.admin.AdminDonorAccountsService;
import cz.novanadeje.app.donations.domain.donation.DonationPurpose;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.donations.domain.donor.SenderAccountLinkId;
import org.springframework.context.MessageSource;
import org.springframework.context.i18n.LocaleContextHolder;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/admin/donations/donors/{donorId}")
class AdminDonorAccountsController {

    private static final String PURPOSE_KEY_PREFIX = "donation.purpose.";

    private final AdminDonorAccountsService donorAccounts;
    private final MessageSource messages;

    AdminDonorAccountsController(AdminDonorAccountsService donorAccounts, MessageSource messages) {
        this.donorAccounts = donorAccounts;
        this.messages = messages;
    }

    @GetMapping
    AdminDonorDetailResponse detail(@PathVariable UUID donorId) {
        return AdminDonorDetailResponse.from(donorAccounts.view(new DonorReference(donorId)), this::purposeText);
    }

    @PostMapping("/bank-accounts/{linkId}/disconnect")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void disconnect(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID donorId, @PathVariable UUID linkId) {
        donorAccounts.disconnect(admin(jwt), new DonorReference(donorId), new SenderAccountLinkId(linkId));
    }

    @PostMapping("/bank-accounts/{linkId}/reconnect")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void reconnect(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID donorId, @PathVariable UUID linkId) {
        donorAccounts.reconnect(admin(jwt), new DonorReference(donorId), new SenderAccountLinkId(linkId));
    }

    @DeleteMapping("/bank-accounts/{linkId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void remove(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID donorId, @PathVariable UUID linkId) {
        donorAccounts.remove(admin(jwt), new DonorReference(donorId), new SenderAccountLinkId(linkId));
    }

    private String purposeText(DonationPurpose purpose) {
        return messages.getMessage(PURPOSE_KEY_PREFIX + purpose.name(), null, LocaleContextHolder.getLocale());
    }

    private static UUID admin(Jwt jwt) {
        return UUID.fromString(jwt.getSubject());
    }
}

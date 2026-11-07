package cz.novanadeje.app.donors.interfaces.rest;

import cz.novanadeje.app.donors.application.DonorEmailVerificationService;
import jakarta.validation.Valid;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/donors/auth/email-change")
class DonorEmailChangeConfirmationController {

    private final DonorEmailVerificationService emailVerification;

    DonorEmailChangeConfirmationController(DonorEmailVerificationService emailVerification) {
        this.emailVerification = emailVerification;
    }

    @PostMapping("/confirm")
    ResponseEntity<Void> confirm(@Valid @RequestBody EmailChangeConfirmation request) {
        emailVerification.confirmChange(request.token());
        return ResponseEntity.noContent()
                .header(HttpHeaders.SET_COOKIE, RefreshTokenCookie.cleared().toString())
                .build();
    }
}

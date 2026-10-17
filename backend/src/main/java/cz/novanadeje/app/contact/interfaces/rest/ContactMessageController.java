package cz.novanadeje.app.contact.interfaces.rest;

import cz.novanadeje.app.contact.application.SubmitContactMessageService;
import cz.novanadeje.app.shared.interfaces.rest.ProblemTypes;
import cz.novanadeje.app.shared.interfaces.rest.RateLimitExceededException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/contact/messages")
class ContactMessageController {

    private final SubmitContactMessageService submitContactMessage;
    private final ContactMessageRateLimiter rateLimiter;

    ContactMessageController(SubmitContactMessageService submitContactMessage, ContactMessageRateLimiter rateLimiter) {
        this.submitContactMessage = submitContactMessage;
        this.rateLimiter = rateLimiter;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.ACCEPTED)
    void submit(@Valid @RequestBody SubmitContactMessageRequest request, HttpServletRequest http) {
        if (!rateLimiter.allows(http.getRemoteAddr())) {
            throw new RateLimitExceededException(ProblemTypes.of("contact", "rate-limited"));
        }
        if (request.isFilledByBot()) {
            return;
        }
        submitContactMessage.submit(request.toCommand());
    }
}

package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.application.importing.HistoryImportService;
import cz.novanadeje.app.donations.application.importing.ImportStatusService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/admin/donations")
class AdminImportStateController {

    private final ImportStatusService importStatus;
    private final HistoryImportService historyImports;
    private final HistoryImportRateLimiter rateLimiter;

    AdminImportStateController(ImportStatusService importStatus, HistoryImportService historyImports, HistoryImportRateLimiter rateLimiter) {
        this.importStatus = importStatus;
        this.historyImports = historyImports;
        this.rateLimiter = rateLimiter;
    }

    @GetMapping("/import-state")
    ImportStateResponse importState() {
        return ImportStateResponse.from(importStatus.currentState());
    }

    @PostMapping("/import/history")
    @ResponseStatus(HttpStatus.ACCEPTED)
    HistoryImportResponse requestHistoryImport(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody HistoryImportRequest request,
                                               HttpServletRequest http) {
        rateLimiter.check(http.getRemoteAddr());
        return HistoryImportResponse.from(historyImports.request(UUID.fromString(jwt.getSubject()), request.from()));
    }
}

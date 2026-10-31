package cz.novanadeje.app.operations.interfaces.rest;

import cz.novanadeje.app.operations.application.clienterrors.ClientErrorReportService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/operations/client-errors")
class ClientErrorReportController {

    private final ClientErrorReportService reports;
    private final ClientErrorRateLimiter rateLimiter;

    ClientErrorReportController(ClientErrorReportService reports, ClientErrorRateLimiter rateLimiter) {
        this.reports = reports;
        this.rateLimiter = rateLimiter;
    }

    @PostMapping(consumes = MediaType.APPLICATION_JSON_VALUE)
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void report(@Valid @RequestBody ClientErrorReportRequest request, HttpServletRequest http) {
        rateLimiter.check(http.getRemoteAddr());
        reports.record(request.toReport());
    }
}

package cz.novanadeje.app.operations.interfaces.rest;

import cz.novanadeje.app.operations.application.diagnostics.DiagnosticsService;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin/operations/diagnostics")
class AdminDiagnosticsController {

    private final DiagnosticsService diagnostics;

    AdminDiagnosticsController(DiagnosticsService diagnostics) {
        this.diagnostics = diagnostics;
    }

    @GetMapping
    DiagnosticsResponse diagnostics() {
        return DiagnosticsResponse.from(diagnostics.view());
    }

    @GetMapping(value = "/threads", produces = MediaType.TEXT_PLAIN_VALUE)
    String threads() {
        return diagnostics.threadDump();
    }
}

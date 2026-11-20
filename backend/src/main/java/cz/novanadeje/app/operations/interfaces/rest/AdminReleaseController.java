package cz.novanadeje.app.operations.interfaces.rest;

import cz.novanadeje.app.operations.application.release.ReleaseCheckService;
import cz.novanadeje.app.operations.application.release.ReleaseHistoryService;
import cz.novanadeje.app.operations.domain.release.Release;
import cz.novanadeje.app.shared.infrastructure.config.BuildProperties;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin/operations/release")
class AdminReleaseController {

    private final ReleaseCheckService checks;
    private final ReleaseHistoryService history;
    private final BuildProperties build;

    AdminReleaseController(ReleaseCheckService checks, ReleaseHistoryService history, BuildProperties build) {
        this.checks = checks;
        this.history = history;
        this.build = build;
    }

    @GetMapping
    ReleaseResponse release() {
        return ReleaseResponse.from(build.version(), checks.status(Release.parse(build.version())));
    }

    @GetMapping("/history")
    ReleaseHistoryResponse history() {
        return ReleaseHistoryResponse.from(history.history());
    }
}

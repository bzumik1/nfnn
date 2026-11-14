package cz.novanadeje.app.operations.interfaces.rest;

import cz.novanadeje.app.operations.application.release.ReleaseCheckService;
import cz.novanadeje.app.operations.domain.release.Release;
import cz.novanadeje.app.shared.infrastructure.config.BuildProperties;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin/operations/release")
class AdminReleaseController {

    private final ReleaseCheckService checks;
    private final BuildProperties build;

    AdminReleaseController(ReleaseCheckService checks, BuildProperties build) {
        this.checks = checks;
        this.build = build;
    }

    @GetMapping
    ReleaseResponse release() {
        return ReleaseResponse.from(build.version(), checks.status(Release.parse(build.version())));
    }
}

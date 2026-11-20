package cz.novanadeje.app.operations.infrastructure.startup;

import cz.novanadeje.app.operations.application.release.ReleaseHistoryService;
import cz.novanadeje.app.operations.domain.release.Release;
import cz.novanadeje.app.operations.domain.release.Revision;
import cz.novanadeje.app.operations.domain.release.RunningBuild;
import cz.novanadeje.app.shared.infrastructure.config.BuildProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import java.util.Optional;

@Component
class ReleaseRunAtStart {

    private static final Logger log = LoggerFactory.getLogger(ReleaseRunAtStart.class);

    private final ReleaseHistoryService history;
    private final BuildProperties build;

    ReleaseRunAtStart(ReleaseHistoryService history, BuildProperties build) {
        this.history = history;
        this.build = build;
    }

    @EventListener(ApplicationReadyEvent.class)
    void recordStart() {
        Optional<Revision> revision = Revision.parse(build.revision());
        if (revision.isEmpty()) {
            log.warn("Release history: the revision has no recordable shape, so this start is not recorded");
            return;
        }
        try {
            log.info("Release history: {}", history.recordStart(new RunningBuild(revision.get(), Release.parse(build.version()))));
        } catch (RuntimeException failure) {
            log.warn("Release history: recording this start failed: {}", failure.getClass().getSimpleName());
        }
    }
}

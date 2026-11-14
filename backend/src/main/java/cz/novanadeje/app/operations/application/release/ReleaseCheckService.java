package cz.novanadeje.app.operations.application.release;

import cz.novanadeje.app.operations.domain.release.LatestRelease;
import cz.novanadeje.app.operations.domain.release.Release;
import cz.novanadeje.app.operations.domain.release.ReleaseCheckFailure;
import cz.novanadeje.app.operations.domain.release.ReleaseStatus;
import cz.novanadeje.app.shared.domain.FoundationZone;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.YearMonth;
import java.util.Optional;

@Service
public class ReleaseCheckService {

    static final Duration PUBLICATION_TOLERANCE = Duration.ofDays(1);

    private final LatestReleaseSource source;
    private final ReleaseChecks checks;
    private final Clock clock;

    public ReleaseCheckService(LatestReleaseSource source, ReleaseChecks checks, Clock clock) {
        this.source = source;
        this.checks = checks;
        this.clock = clock;
    }

    public ReleaseCheckOutcome check() {
        Instant now = clock.instant();
        try {
            LatestRelease latest = source.fetch();
            if (!isPlausible(latest, now)) {
                return failed(new LatestReleaseUnavailable(ReleaseCheckFailure.REFUSED_ANSWER), now);
            }
            checks.record(known -> known.found(latest, now));
            return new ReleaseCheckOutcome.Found(latest.release());
        } catch (LatestReleaseUnavailable unavailable) {
            return failed(unavailable, now);
        }
    }

    public ReleaseStatus status(Optional<Release> running) {
        return checks.current().statusFor(running);
    }

    private ReleaseCheckOutcome failed(LatestReleaseUnavailable unavailable, Instant now) {
        checks.record(known -> known.failed(unavailable.failure(), now));
        return new ReleaseCheckOutcome.Failed(unavailable.failure(), unavailable.outcome());
    }

    private static boolean isPlausible(LatestRelease latest, Instant now) {
        YearMonth pragueMonth = YearMonth.from(now.atZone(FoundationZone.ZONE));
        return !latest.release().month().isAfter(pragueMonth) && !latest.publishedAt().isAfter(now.plus(PUBLICATION_TOLERANCE));
    }
}

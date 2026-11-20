package cz.novanadeje.app.operations.interfaces.rest;

import cz.novanadeje.app.operations.domain.release.Release;
import cz.novanadeje.app.operations.domain.release.ReleaseRunPeriod;

import java.time.Instant;
import java.util.List;

record ReleaseHistoryResponse(List<Entry> entries) {

    static ReleaseHistoryResponse from(List<ReleaseRunPeriod> periods) {
        return new ReleaseHistoryResponse(periods.stream().map(Entry::from).toList());
    }

    record Entry(String release, String revision, Instant startedAt, Instant lastStartedAt, Instant endedAt) {

        static Entry from(ReleaseRunPeriod period) {
            return new Entry(period.run().release().map(Release::toString).orElse(null), period.run().revision().value(), period.run().startedAt(),
                    period.run().lastStartedAt(), period.endedAt().orElse(null));
        }
    }
}

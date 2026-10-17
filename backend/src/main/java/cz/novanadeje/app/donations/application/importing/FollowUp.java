package cz.novanadeje.app.donations.application.importing;

import cz.novanadeje.app.donations.domain.importing.ImportTrigger;

import java.time.Instant;

public record FollowUp(Instant at, ImportTrigger trigger) {

    public FollowUp {
        if (at == null || trigger == null) {
            throw new IllegalArgumentException("A follow-up needs its time and trigger");
        }
    }
}

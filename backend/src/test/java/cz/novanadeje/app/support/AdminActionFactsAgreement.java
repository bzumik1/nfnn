package cz.novanadeje.app.support;

import cz.novanadeje.app.donors.application.AdminActionFacts;
import cz.novanadeje.app.shared.application.event.AdminActionPerformed;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;

public final class AdminActionFactsAgreement {

    private AdminActionFactsAgreement() {
    }

    public static void assertFactsAgreeWithDetails(AdminActionPerformed event) {
        assertThat(disagreement(event)).as("facts of %s", event.action()).isEmpty();
    }

    public static Optional<String> disagreement(AdminActionPerformed event) {
        Optional<AdminActionFacts> read = OlderAuditEntries.factsOf(event.action(), event.details());
        if (read.isEmpty()) {
            return Optional.empty();
        }
        if (event.facts().isEmpty()) {
            return Optional.of(event.action() + " publishes no facts, though the frozen shapes read " + read.get() + " from its details");
        }
        AdminActionPerformed.Facts published = event.facts().get();
        boolean keepsEveryReadValue = read.get().values().entrySet().stream()
                .allMatch(value -> value.getValue().equals(published.values().get(value.getKey())));
        if (!published.summaryKey().equals(read.get().summaryKey()) || !keepsEveryReadValue) {
            return Optional.of(event.action() + " publishes " + published + ", but the frozen shapes read " + read.get() + " from its details");
        }
        return Optional.empty();
    }
}

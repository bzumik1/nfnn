package cz.novanadeje.app.support;

import cz.novanadeje.app.donors.application.AdminActionFacts;
import cz.novanadeje.app.shared.application.event.AdminActionPerformed;

import java.util.Map;
import java.util.Optional;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

public final class AdminActionFactsAgreement {

    private static final Set<String> NORMALISED_FROM_DETAILS = Set.of("sections", "settings", "previous");

    private AdminActionFactsAgreement() {
    }

    public static void assertFactsAgreeWithDetails(AdminActionPerformed event) {
        assertThat(OlderAuditEntries.factsOf(event.action(), event.details()))
                .as("the details of %s no longer match a frozen shape: assert this publisher's facts directly instead", event.action()).isPresent();
        assertThat(disagreement(event)).as("facts of %s", event.action()).isEmpty();
    }

    public static Optional<String> disagreement(AdminActionPerformed event) {
        Optional<String> beyondDetails = event.facts().stream().flatMap(published -> published.values().entrySet().stream())
                .filter(value -> !NORMALISED_FROM_DETAILS.contains(value.getKey()) && !event.details().contains(value.getValue()))
                .map(Map.Entry::getKey)
                .findFirst()
                .map(name -> event.action() + " publishes the fact " + name + ", which its details do not say");
        if (beyondDetails.isPresent()) {
            return beyondDetails;
        }
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

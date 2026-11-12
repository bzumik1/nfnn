package cz.novanadeje.app.donors.interfaces.rest;

import cz.novanadeje.app.donors.application.AdminAccountsSyncSnapshot;
import cz.novanadeje.app.donors.application.AdminActionFacts;
import cz.novanadeje.app.donors.application.AdminActionView;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.shared.interfaces.rest.SyncChunk;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.context.support.ResourceBundleMessageSource;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class AdminDonorsSyncProjectionTest {

    private static final Instant NOW = Instant.parse("2026-10-24T09:00:00Z");
    private static final DonorId SUBJECT = DonorId.newId(NOW.minusSeconds(100));
    private static final UUID ACTION = UUID.fromString("0192f0f1-0000-7000-8000-0000000000a1");
    private static final UUID ADMIN = UUID.fromString("0192f0f1-0000-7000-8000-0000000000a2");
    private static final String DONOR = "0192f0f1-0000-7000-8000-0000000000a3";
    private static final String LINK = "0192f0f1-0000-7000-8000-0000000000a4";

    private final JsonMapper json = JsonMapper.builder().build();
    private final AdminDonorsSyncProjection projection = new AdminDonorsSyncProjection(json, new AdminActionSummaries(messages()));

    @Test
    @DisplayName("Given an action whose details no shape reads, when the trail is projected, then its row has no summary and the details appear nowhere in it")
    void should_write_no_summary_and_no_details_when_projected_given_an_action_of_unknown_shape() {
        String details = "Starší záznam bez šablony, účet 2400000002/2010, pokladni@example.cz";

        JsonNode row = onlyRow(action("CHANGE_LOG_LEVEL", details));

        assertThat(row.has("summary")).isTrue();
        assertThat(row.get("summary").isNull()).isTrue();
        assertThat(row.toString()).doesNotContain(details).doesNotContain("2400000002").doesNotContain("pokladni@example.cz")
                .doesNotContain("\"details\"");
    }

    @Test
    @DisplayName("Given an action that names a donor's bank account, when the trail is projected, then its row's summary leaves the account out and names the donor")
    void should_leave_the_account_out_when_projected_given_an_action_naming_an_account() {
        JsonNode row = onlyRow(action("DISCONNECT_SENDER_ACCOUNT", "Párování z účtu 2400000002/2010 (propojení " + LINK + ") dárce " + DONOR + " vypnuto"));

        assertThat(row.get("summary").asString()).isEqualTo("Párování plateb z jednoho bankovního účtu dárci (účet už neexistuje) vypnuto.");
        assertThat(row.get("donorId").asString()).isEqualTo(DONOR);
        assertThat(row.toString()).doesNotContain("2400000002");
    }

    private JsonNode onlyRow(AdminActionView action) {
        List<SyncChunk> chunks = projection.chunksOf(new AdminAccountsSyncSnapshot(SUBJECT, true, List.of(), List.of(action)));
        assertThat(chunks).extracting(SyncChunk::id).containsExactly("audit:2026-10");
        return chunks.getFirst().rows().get(0);
    }

    private static AdminActionView action(String action, String details) {
        return new AdminActionView(ACTION, ADMIN, Optional.empty(), action, Optional.empty(), details, NOW, Optional.empty(),
                AdminActionFacts.read(action, details), Optional.empty());
    }

    private static ResourceBundleMessageSource messages() {
        ResourceBundleMessageSource messages = new ResourceBundleMessageSource();
        messages.setBasename("i18n/messages");
        messages.setDefaultEncoding("UTF-8");
        messages.setFallbackToSystemLocale(false);
        return messages;
    }
}

package cz.novanadeje.app.shared.application.event;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;
import java.util.stream.IntStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class AdminActionPerformedTest {

    private static final UUID ADMIN = UUID.fromString("01a18e56-bdb0-775a-bd0a-a60756831369");
    private static final Instant AT = Instant.parse("2026-10-22T10:00:00Z");

    @Test
    @DisplayName("Given an action and details with spaces around them, when the event is created, then both are trimmed")
    void should_trim_texts_when_created_given_padded_action_and_details() {
        AdminActionPerformed event = new AdminActionPerformed(ADMIN, " PAIR_PAYMENT ", Optional.empty(), " paired 1001 to Jana ", AT);

        assertThat(event.action()).isEqualTo("PAIR_PAYMENT");
        assertThat(event.details()).isEqualTo("paired 1001 to Jana");
    }

    @Test
    @DisplayName("Given a blank action, when the event is created, then it is refused")
    void should_refuse_when_created_given_blank_action() {
        assertThatThrownBy(() -> new AdminActionPerformed(ADMIN, " ", Optional.empty(), "details", AT))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("action");
    }

    @Test
    @DisplayName("Given overlong details, when the event is created, then it is refused")
    void should_refuse_when_created_given_overlong_details() {
        assertThatThrownBy(() -> new AdminActionPerformed(ADMIN, "PAIR_PAYMENT", Optional.empty(), "x".repeat(2001), AT))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("2000");
    }

    @Test
    @DisplayName("Given no administrator, when the event is created, then it is refused")
    void should_refuse_when_created_given_no_admin() {
        assertThatThrownBy(() -> new AdminActionPerformed(null, "PAIR_PAYMENT", Optional.empty(), "details", AT))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("Given no facts, when the event is created, then it carries none")
    void should_carry_no_facts_when_created_given_none() {
        AdminActionPerformed event = new AdminActionPerformed(ADMIN, "ORDER_PEOPLE", Optional.empty(), "Pořadí lidí fondu změněno", AT);

        assertThat(event.facts()).isEmpty();
    }

    @Test
    @DisplayName("Given facts under the action's own summary key, when the event is created, then it carries them")
    void should_carry_facts_when_created_given_facts_of_its_action() {
        AdminActionPerformed.Facts facts = AdminActionPerformed.Facts.of("REMOVE_BANK_LOGO", Map.of("bank", "0100"));

        AdminActionPerformed event = new AdminActionPerformed(ADMIN, "REMOVE_BANK_LOGO", Optional.empty(), "Logo banky 0100 odebráno", facts, AT);

        assertThat(event.facts()).contains(facts);
    }

    @Test
    @DisplayName("Given facts under a variant of the action's summary key, when the event is created, then it carries them")
    void should_carry_facts_when_created_given_facts_of_a_variant_of_its_action() {
        AdminActionPerformed.Facts facts = AdminActionPerformed.Facts.of("ISSUE_RECEIPT.yearly", Map.of("number", "2027-000002", "year", "2026"));

        AdminActionPerformed event = new AdminActionPerformed(ADMIN, "ISSUE_RECEIPT", Optional.empty(), "Potvrzení 2027-000002 za rok 2026", facts, AT);

        assertThat(event.facts()).contains(facts);
    }

    @Test
    @DisplayName("Given facts under another action's summary key, when the event is created, then it is refused")
    void should_refuse_when_created_given_facts_of_another_action() {
        AdminActionPerformed.Facts facts = AdminActionPerformed.Facts.of("ISSUE_RECEIPTS");

        assertThatThrownBy(() -> new AdminActionPerformed(ADMIN, "ISSUE_RECEIPT", Optional.empty(), "details", facts, AT))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("summary key");
    }

    @Test
    @DisplayName("Given facts, when the event is created with them absent as an optional, then it carries none")
    void should_carry_no_facts_when_created_given_an_empty_optional() {
        AdminActionPerformed event = new AdminActionPerformed(ADMIN, "ORDER_PEOPLE", Optional.empty(), "details", Optional.empty(), AT);

        assertThat(event.facts()).isEmpty();
    }

    @Test
    @DisplayName("Given values that change after the facts were made, when the facts are read, then they keep the values they were made with")
    void should_keep_values_when_read_given_values_changed_after() {
        Map<String, String> values = new HashMap<>(Map.of("bank", "0100"));
        AdminActionPerformed.Facts facts = AdminActionPerformed.Facts.of("REMOVE_BANK_LOGO", values);

        values.put("bank", "0800");

        assertThat(facts.values()).containsExactly(Map.entry("bank", "0100"));
    }

    @Test
    @DisplayName("Given a summary key that is no action or no action and variant, when the facts are made, then they are refused")
    void should_refuse_when_made_given_a_malformed_summary_key() {
        assertThatThrownBy(() -> AdminActionPerformed.Facts.of("remove_bank_logo")).isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("summary key");
        assertThatThrownBy(() -> AdminActionPerformed.Facts.of("ISSUE_RECEIPT.")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> AdminActionPerformed.Facts.of("ISSUE_RECEIPT.Yearly")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> AdminActionPerformed.Facts.of(null)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("Given a value name that is not a lowercase word in camel case, when the facts are made, then they are refused")
    void should_refuse_when_made_given_a_malformed_value_name() {
        assertThatThrownBy(() -> AdminActionPerformed.Facts.of("REMOVE_BANK_LOGO", Map.of("Bank", "0100")))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("name");
        assertThatThrownBy(() -> AdminActionPerformed.Facts.of("REMOVE_BANK_LOGO", Map.of("bank code", "0100")))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> AdminActionPerformed.Facts.of("REMOVE_BANK_LOGO", Map.of("b".repeat(33), "0100")))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("Given more values than an action has, when the facts are made, then they are refused")
    void should_refuse_when_made_given_too_many_values() {
        Map<String, String> values = IntStream.rangeClosed(1, AdminActionPerformed.Facts.MAX_VALUES + 1).boxed()
                .collect(Collectors.toMap(index -> "value" + (char) ('a' + index), index -> "1"));

        assertThatThrownBy(() -> AdminActionPerformed.Facts.of("BACKUP_RESTORED", values))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining(Integer.toString(AdminActionPerformed.Facts.MAX_VALUES));
    }

    @Test
    @DisplayName("Given values longer together than the details may be, when the facts are made, then they are refused")
    void should_refuse_when_made_given_values_longer_than_the_details_may_be() {
        Map<String, String> values = Map.of("title", "x".repeat(1000), "slug", "y".repeat(1001));

        assertThatThrownBy(() -> AdminActionPerformed.Facts.of("CREATE_NEWS.withTitle", values))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("2000");
    }

    @Test
    @DisplayName("Given an absent values map, when the facts are made, then they are refused")
    void should_refuse_when_made_given_no_values() {
        assertThatThrownBy(() -> AdminActionPerformed.Facts.of("REMOVE_BANK_LOGO", null)).isInstanceOf(IllegalArgumentException.class);
    }
}

package cz.novanadeje.app.support;

import org.springframework.jdbc.core.simple.JdbcClient;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.UUID;

public final class ReceiptSignatories {

    public static final UUID PERSON = UUID.fromString("019a3a00-0000-7000-8000-0000000051a1");
    public static final String NAME = "Josef Vzorový";
    public static final String RECEIPT_ROLE = "předseda správní rady";

    private ReceiptSignatories() {
    }

    public static void chooseAfterEmptyTables(JdbcClient jdbc, Instant at) {
        choose(jdbc, PERSON, NAME, RECEIPT_ROLE, at);
    }

    public static void choose(JdbcClient jdbc, UUID person, String name, String receiptRole, Instant at) {
        Timestamp time = Timestamp.from(at);
        jdbc.sql("""
                        insert into content_person (id, name, position, on_board, featured, created_at, updated_at)
                        values (:id, :name, (select coalesce(max(position), -1) + 1 from content_person), false, false, :at, :at)
                        on conflict (id) do update set name = excluded.name""")
                .param("id", person).param("name", name).param("at", time).update();
        jdbc.sql("""
                        insert into donation_receipt_signatory (id, person_id, receipt_role, chosen_at) values (1, :person, :role, :at)
                        on conflict (id) do update set person_id = excluded.person_id, receipt_role = excluded.receipt_role, chosen_at = excluded.chosen_at""")
                .param("person", person).param("role", receiptRole).param("at", time).update();
    }
}

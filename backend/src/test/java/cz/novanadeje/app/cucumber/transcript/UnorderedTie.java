package cz.novanadeje.app.cucumber.transcript;

import java.util.List;

public record UnorderedTie(String request, String path, String reason) {

    public static final List<UnorderedTie> V2 = List.of(
            new UnorderedTie("GET /api/admin/donors/actions", "$.items",
                    "AdminActionJpaRepository orders by performedAt desc, then id desc; under the fixed recording clock tied actions differ only in the "
                            + "random bits of their UUIDv7 ids, and two recordings of 70e9233 listed them in other orders"));
}

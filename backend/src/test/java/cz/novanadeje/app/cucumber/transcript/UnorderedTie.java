package cz.novanadeje.app.cucumber.transcript;

import java.util.List;

public record UnorderedTie(String request, String path, String reason) {

    public static final List<UnorderedTie> V2 = List.of(
            new UnorderedTie("GET /api/admin/donors/actions", "$.items",
                    "AdminActionJpaRepository orders by performedAt desc, then id desc; under the fixed recording clock tied actions differ only in the "
                            + "random bits of their UUIDv7 ids, and two recordings of 70e9233 listed them in other orders"),
            new UnorderedTie("GET /api/admin/donations/sync/chunks", "$.chunks[].rows",
                    "AdminDonationsSyncProjection orders donor records, their bank accounts and gifts of one day by their instant, then by id; under the "
                            + "fixed recording clock donors registered, accounts learned and gifts recorded in one step tie and differ only in the random "
                            + "bits of their UUIDv7 ids"),
            new UnorderedTie("GET /api/admin/donors/sync/chunks", "$.chunks[].rows",
                    "AdminDonorsSyncProjection orders accounts by registration and the trail by performedAt, then by id; under the fixed recording "
                            + "clock accounts registered and actions recorded in one step tie and differ only in the random bits of their UUIDv7 ids"));
}

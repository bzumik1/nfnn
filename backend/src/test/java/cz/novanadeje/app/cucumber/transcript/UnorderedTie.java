package cz.novanadeje.app.cucumber.transcript;

import java.util.List;

public record UnorderedTie(String request, String path, List<String> orderedBy, String reason) {

    public UnorderedTie {
        if (orderedBy == null || orderedBy.isEmpty()) {
            throw new IllegalArgumentException("An unordered tie names the fields its list is ordered by before its random ids");
        }
        orderedBy = List.copyOf(orderedBy);
    }

    public static final List<UnorderedTie> V2 = List.of(
            new UnorderedTie("GET /api/admin/donors/actions", "$.items", List.of("performedAt"),
                    "AdminActionJpaRepository orders by performedAt desc, then id desc; under the fixed recording clock tied actions differ only in the "
                            + "random bits of their UUIDv7 ids, and two recordings of 70e9233 listed them in other orders"),
            new UnorderedTie("GET /api/admin/donations/sync/chunks", "$.chunks[].rows", List.of("receivedAt", "recordedAt", "registeredAt", "createdAt"),
                    "AdminDonationsSyncProjection orders gifts by their day and recording, donor records by their registration and bank account links "
                            + "by their creation, each then by id; under the fixed recording clock gifts recorded, donors registered and accounts learned in "
                            + "one step tie and differ only in the random bits of their UUIDv7 ids, and two recordings of the erasure scenario listed two "
                            + "donor records in other orders"),
            new UnorderedTie("GET /api/admin/donors/sync/chunks", "$.chunks[].rows", List.of("registeredAt", "performedAt"),
                    "AdminDonorsSyncProjection orders accounts by registration and the trail by performedAt, then by id; under the fixed recording "
                            + "clock accounts registered and actions recorded in one step tie and differ only in the random bits of their UUIDv7 ids"));
}

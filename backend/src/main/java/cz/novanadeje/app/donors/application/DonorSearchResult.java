package cz.novanadeje.app.donors.application;

import java.util.List;

public record DonorSearchResult(List<DonorAccountView> items, boolean hasMore) {

    public DonorSearchResult {
        items = List.copyOf(items);
    }
}

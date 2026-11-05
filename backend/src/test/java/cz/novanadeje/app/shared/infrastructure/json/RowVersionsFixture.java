package cz.novanadeje.app.shared.infrastructure.json;

import cz.novanadeje.app.shared.application.version.RowVersions;
import tools.jackson.databind.json.JsonMapper;

public final class RowVersionsFixture {

    private RowVersionsFixture() {
    }

    public static RowVersions canonical() {
        return new CanonicalRowVersions(JsonMapper.builder().build());
    }
}

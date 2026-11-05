package cz.novanadeje.app.shared.application.version;

import java.util.List;

public interface RowVersions {

    String VERSION_FIELD = "version";

    String versionOf(List<?> rows);
}

package cz.novanadeje.app.operations.application.backup;

import java.io.IOException;
import java.io.InputStream;

@FunctionalInterface
public interface BackupContent {

    InputStream open() throws IOException;
}

package cz.novanadeje.app.operations.interfaces.rest;

import cz.novanadeje.app.operations.application.backup.BackupDownload;
import org.springframework.core.io.AbstractResource;

import java.io.IOException;
import java.io.InputStream;

final class BackupDownloadResource extends AbstractResource {

    private final BackupDownload download;

    BackupDownloadResource(BackupDownload download) {
        this.download = download;
    }

    @Override
    public boolean exists() {
        return true;
    }

    @Override
    public long contentLength() {
        return download.file().sizeBytes();
    }

    @Override
    public String getFilename() {
        return download.file().name();
    }

    @Override
    public String getDescription() {
        return "backup " + download.file().name();
    }

    @Override
    public InputStream getInputStream() throws IOException {
        return download.content().open();
    }
}

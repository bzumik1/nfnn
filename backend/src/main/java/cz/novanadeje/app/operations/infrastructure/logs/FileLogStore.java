package cz.novanadeje.app.operations.infrastructure.logs;

import cz.novanadeje.app.operations.application.logs.LogStore;
import cz.novanadeje.app.operations.domain.logs.LogFile;
import cz.novanadeje.app.operations.domain.logs.LogMatch;
import cz.novanadeje.app.operations.domain.logs.LogReadLimits;
import cz.novanadeje.app.operations.domain.logs.LogWindow;
import cz.novanadeje.app.operations.domain.logs.LogsUnavailable;
import org.springframework.stereotype.Component;

import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.RandomAccessFile;
import java.io.UncheckedIOException;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Deque;
import java.util.List;
import java.util.Optional;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import java.util.zip.GZIPInputStream;

@Component
class FileLogStore implements LogStore {

    private static final int GZIP_TRAILER_BYTES = 8;
    private static final byte NEWLINE = '\n';

    private final Path directory;

    FileLogStore(LogProperties properties) {
        this.directory = properties.directory();
    }

    @Override
    public boolean isAvailable() {
        return Files.isDirectory(directory) && Files.isReadable(directory);
    }

    @Override
    public List<LogFile> files() {
        try (Stream<Path> entries = Files.list(directory)) {
            return entries.filter(Files::isRegularFile)
                    .filter(path -> LogFile.isValidName(path.getFileName().toString()))
                    .map(FileLogStore::describe)
                    .sorted(Comparator.comparing(LogFile::name))
                    .toList();
        } catch (IOException e) {
            throw new LogsUnavailable();
        }
    }

    @Override
    public Optional<LogFile> file(String name) {
        Path path = directory.resolve(name);
        if (!LogFile.isValidName(name) || !Files.isRegularFile(path)) {
            return Optional.empty();
        }
        return Optional.of(describe(path));
    }

    @Override
    public LogWindow read(LogFile file, Optional<Long> from, int bytes) {
        Path path = directory.resolve(file.name());
        long size = file.compressed() ? uncompressedSize(path) : file.sizeBytes();
        long start = from.map(requested -> Math.clamp(requested, 0, size)).orElse(Math.max(0, size - bytes));
        long wantedEnd = Math.min(size, start + bytes);
        long readStart = Math.max(0, start - 1);
        long readEnd = Math.min(size, wantedEnd + LogReadLimits.MAX_LINE_LENGTH);
        byte[] raw = file.compressed() ? readCompressed(path, readStart, (int) (readEnd - readStart))
                : readPlain(path, readStart, (int) (readEnd - readStart));
        int keepFrom = 0;
        if (start > 0) {
            int firstNewline = indexOf(raw, 0, raw.length);
            keepFrom = firstNewline < 0 ? raw.length : firstNewline + 1;
        }
        int keepTo = raw.length;
        if (wantedEnd < size) {
            int lineEnd = indexOf(raw, (int) Math.max(keepFrom, wantedEnd - readStart - 1), raw.length);
            keepTo = lineEnd < 0 ? raw.length : lineEnd + 1;
        }
        keepTo = Math.max(keepFrom, keepTo);
        String text = new String(raw, keepFrom, keepTo - keepFrom, StandardCharsets.UTF_8);
        return new LogWindow(file.name(), size, readStart + keepFrom, readStart + keepTo, text);
    }

    @Override
    public List<LogMatch> search(LogFile file, Pattern pattern, int limit, Optional<Long> before) {
        Path path = directory.resolve(file.name());
        long stopAt = before.orElse(Long.MAX_VALUE);
        Deque<LogMatch> newest = new ArrayDeque<>(limit);
        try (InputStream input = new BufferedInputStream(open(path, file.compressed()))) {
            ByteArrayOutputStream line = new ByteArrayOutputStream();
            long offset = 0;
            long lineStart = 0;
            int read;
            while ((read = input.read()) >= 0) {
                offset++;
                if (read == NEWLINE) {
                    if (lineStart >= stopAt) {
                        break;
                    }
                    remember(newest, limit, pattern, lineStart, line.toByteArray());
                    line.reset();
                    lineStart = offset;
                } else {
                    line.write(read);
                }
            }
            if (line.size() > 0 && lineStart < stopAt) {
                remember(newest, limit, pattern, lineStart, line.toByteArray());
            }
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        List<LogMatch> result = new ArrayList<>(newest);
        return result.reversed();
    }

    private static void remember(Deque<LogMatch> newest, int limit, Pattern pattern, long offset, byte[] bytes) {
        String text = new String(bytes, StandardCharsets.UTF_8);
        if (!pattern.matcher(text).find()) {
            return;
        }
        if (newest.size() == limit) {
            newest.removeFirst();
        }
        newest.addLast(new LogMatch(offset, text.length() > LogReadLimits.MAX_LINE_LENGTH ? text.substring(0, LogReadLimits.MAX_LINE_LENGTH) : text));
    }

    private static LogFile describe(Path path) {
        try {
            return new LogFile(path.getFileName().toString(), Files.size(path), Files.getLastModifiedTime(path).toInstant(),
                    LogFile.isCompressed(path.getFileName().toString()));
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private static InputStream open(Path path, boolean compressed) throws IOException {
        InputStream input = Files.newInputStream(path);
        return compressed ? new GZIPInputStream(input) : input;
    }

    private static byte[] readPlain(Path path, long start, int length) {
        try (RandomAccessFile file = new RandomAccessFile(path.toFile(), "r")) {
            byte[] buffer = new byte[length];
            file.seek(start);
            int filled = 0;
            while (filled < length) {
                int read = file.read(buffer, filled, length - filled);
                if (read < 0) {
                    break;
                }
                filled += read;
            }
            return filled == length ? buffer : java.util.Arrays.copyOf(buffer, filled);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private static byte[] readCompressed(Path path, long start, int length) {
        try (InputStream input = new BufferedInputStream(open(path, true))) {
            input.skipNBytes(start);
            return input.readNBytes(length);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private static long uncompressedSize(Path path) {
        try (RandomAccessFile file = new RandomAccessFile(path.toFile(), "r")) {
            if (file.length() < GZIP_TRAILER_BYTES) {
                return 0;
            }
            file.seek(file.length() - 4);
            byte[] trailer = new byte[4];
            file.readFully(trailer);
            return Integer.toUnsignedLong(ByteBuffer.wrap(trailer).order(ByteOrder.LITTLE_ENDIAN).getInt());
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private static int indexOf(byte[] bytes, int from, int to) {
        for (int i = from; i < to; i++) {
            if (bytes[i] == NEWLINE) {
                return i;
            }
        }
        return -1;
    }

    private static int lastIndexOf(byte[] bytes, int from, int to) {
        for (int i = to - 1; i >= from; i--) {
            if (bytes[i] == NEWLINE) {
                return i;
            }
        }
        return -1;
    }
}

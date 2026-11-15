package cz.novanadeje.app.support;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;

public final class PlantedSources {

    private static final Pattern PACKAGE = Pattern.compile("^package ([\\w.]+);", Pattern.MULTILINE);
    private static final Pattern TOP_LEVEL_TYPE = Pattern.compile(
            "^(?:(?:public|abstract|final|sealed|non-sealed|strictfp)\\s+)*(?:class|record|interface|enum|@interface)\\s+(\\w+)", Pattern.MULTILINE);
    private static final String PACKAGE_INFO = "package-info";

    private PlantedSources() {
    }

    public static List<Path> written(Path root, List<String> sources) {
        return sources.stream().map(source -> written(root, source)).toList();
    }

    public static Path written(Path root, String source) {
        Matcher packageName = PACKAGE.matcher(source);
        assertThat(packageName.find()).as("a planted source names its package").isTrue();
        String fileName = source.substring(0, packageName.start()).contains("@") ? PACKAGE_INFO : topLevelTypeOf(source);
        try {
            Path folder = Files.createDirectories(root.resolve(packageName.group(1).replace('.', '/')));
            return Files.writeString(folder.resolve(fileName + ".java"), source);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private static String topLevelTypeOf(String source) {
        Matcher type = TOP_LEVEL_TYPE.matcher(source);
        assertThat(type.find()).as("a planted source declares a top-level type or annotates its package").isTrue();
        return type.group(1);
    }
}

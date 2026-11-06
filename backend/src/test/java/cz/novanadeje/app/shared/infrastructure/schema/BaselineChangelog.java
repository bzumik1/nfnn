package cz.novanadeje.app.shared.infrastructure.schema;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.stream.Stream;

import static cz.novanadeje.app.shared.infrastructure.schema.BaselineDatabase.BASELINE_CHANGELOG;
import static cz.novanadeje.app.shared.infrastructure.schema.BaselineDatabase.CURRENT_CHANGELOG;

record BaselineChangelog(String revision, List<String> files) {

    static final Path DEPLOYED_REVISION = Path.of(".github", "deployed-revision");
    private static final Path RESOURCES = Path.of("backend", "src", "main", "resources");
    private static final Pattern INCLUDE = Pattern.compile("<include file=\"([^\"]+)\"");
    private static final Pattern INCLUDE_ALL = Pattern.compile("<includeAll path=\"([^\"]+)\"");

    static BaselineChangelog read(String revision) throws IOException {
        try (var changelog = Objects.requireNonNull(BaselineChangelog.class.getResourceAsStream("/" + BASELINE_CHANGELOG))) {
            String text = new String(changelog.readAllBytes(), StandardCharsets.UTF_8);
            return new BaselineChangelog(revision, INCLUDE.matcher(text).results().map(include -> include.group(1)).toList());
        }
    }

    static List<String> masterFiles(Path repositoryRoot) throws IOException {
        Path resources = repositoryRoot.resolve(RESOURCES);
        List<String> files = new ArrayList<>();
        for (String folder : INCLUDE_ALL.matcher(Files.readString(resources.resolve(CURRENT_CHANGELOG))).results().map(path -> path.group(1)).toList()) {
            try (Stream<Path> changelogs = Files.list(resources.resolve(folder))) {
                changelogs.map(file -> file.getFileName().toString()).filter(name -> name.endsWith(".xml")).sorted()
                        .forEach(name -> files.add(folder + name));
            }
        }
        return files;
    }

    static String deployedRevision(Path repositoryRoot) throws IOException {
        return Files.readString(repositoryRoot.resolve(DEPLOYED_REVISION)).strip();
    }

    List<String> problems(List<String> master, String deployedRevision) {
        List<String> problems = new ArrayList<>();
        if (!revision.equals(deployedRevision)) {
            problems.add("the baseline is taken at " + revision + ", but the server runs " + deployedRevision + " (" + DEPLOYED_REVISION
                    + "): include every changelog that `git ls-tree -r --name-only " + deployedRevision + " backend/src/main/resources/db/changelog/`"
                    + " lists, in the master's order, give migrations/baseline-data.sql a row for every table they create and set the baseline revision to "
                    + deployedRevision);
        }
        files.stream().filter(file -> !master.contains(file)).distinct().forEach(file -> problems.add(file + " is no changelog of the master"));
        Set<String> seen = new HashSet<>();
        files.stream().filter(file -> !seen.add(file)).distinct().forEach(file -> problems.add(file + " is included twice"));
        List<String> included = new ArrayList<>(new LinkedHashSet<>(files));
        included.retainAll(master);
        List<String> inMasterOrder = master.stream().filter(included::contains).toList();
        if (!included.equals(inMasterOrder)) {
            problems.add("the baseline does not follow the master's order, which is " + inMasterOrder);
        }
        return problems;
    }
}

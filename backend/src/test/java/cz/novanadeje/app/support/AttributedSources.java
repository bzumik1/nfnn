package cz.novanadeje.app.support;

import com.sun.source.tree.CompilationUnitTree;
import com.sun.source.util.JavacTask;
import com.sun.source.util.Trees;

import javax.lang.model.util.Elements;
import javax.lang.model.util.Types;
import javax.tools.Diagnostic;
import javax.tools.DiagnosticCollector;
import javax.tools.JavaCompiler;
import javax.tools.JavaFileObject;
import javax.tools.StandardJavaFileManager;
import javax.tools.ToolProvider;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.lang.ref.SoftReference;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.function.Function;
import java.util.stream.Stream;

public final class AttributedSources {

    private static final Path MAIN_SOURCES = Path.of("src", "main", "java");

    private static SoftReference<AttributedSources> mainSources = new SoftReference<>(null);

    private final List<CompilationUnitTree> units;
    private final Trees trees;
    private final Elements elements;
    private final Types types;

    private AttributedSources(JavacTask task, List<CompilationUnitTree> units) {
        this.units = List.copyOf(units);
        this.trees = Trees.instance(task);
        this.elements = task.getElements();
        this.types = task.getTypes();
    }

    public static synchronized AttributedSources ofMainSources() {
        AttributedSources attributed = mainSources.get();
        if (attributed == null) {
            attributed = attributed(compiler(), javaSources(MAIN_SOURCES));
            mainSources = new SoftReference<>(attributed);
        }
        return attributed;
    }

    public static <T> T read(List<Path> sources, Function<AttributedSources, T> reading) {
        JavaCompiler compiler = compiler();
        DiagnosticCollector<JavaFileObject> diagnostics = new DiagnosticCollector<>();
        try (StandardJavaFileManager files = compiler.getStandardFileManager(diagnostics, Locale.ROOT, StandardCharsets.UTF_8)) {
            return reading.apply(attributed(compiler, files, diagnostics, sources));
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    public List<CompilationUnitTree> units() {
        return units;
    }

    public Trees trees() {
        return trees;
    }

    public Elements elements() {
        return elements;
    }

    public Types types() {
        return types;
    }

    private static JavaCompiler compiler() {
        JavaCompiler compiler = ToolProvider.getSystemJavaCompiler();
        if (compiler == null) {
            throw new IllegalStateException("Reading the sources needs javac of the JDK toolchain");
        }
        return compiler;
    }

    private static AttributedSources attributed(JavaCompiler compiler, List<Path> sources) {
        DiagnosticCollector<JavaFileObject> diagnostics = new DiagnosticCollector<>();
        return attributed(compiler, compiler.getStandardFileManager(diagnostics, Locale.ROOT, StandardCharsets.UTF_8), diagnostics, sources);
    }

    private static AttributedSources attributed(JavaCompiler compiler, StandardJavaFileManager files, DiagnosticCollector<JavaFileObject> diagnostics,
                                                List<Path> sources) {
        List<String> options = List.of("-proc:none", "-classpath", System.getProperty("java.class.path"));
        JavacTask task = (JavacTask) compiler.getTask(null, files, diagnostics, options, null, files.getJavaFileObjectsFromPaths(sources));
        List<CompilationUnitTree> units = new ArrayList<>();
        try {
            task.parse().forEach(units::add);
            task.analyze();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        refuseCompilationErrors(diagnostics);
        return new AttributedSources(task, units);
    }

    private static void refuseCompilationErrors(DiagnosticCollector<JavaFileObject> diagnostics) {
        List<String> errors = diagnostics.getDiagnostics().stream()
                .filter(diagnostic -> diagnostic.getKind() == Diagnostic.Kind.ERROR)
                .map(diagnostic -> diagnostic.getMessage(Locale.ROOT))
                .toList();
        if (!errors.isEmpty()) {
            throw new IllegalStateException("The sources do not compile, so a scan of them would see no types: " + errors);
        }
    }

    private static List<Path> javaSources(Path root) {
        try (Stream<Path> files = Files.walk(root)) {
            List<Path> sources = files.filter(Files::isRegularFile).filter(file -> file.toString().endsWith(".java")).sorted().toList();
            if (sources.isEmpty()) {
                throw new IllegalStateException("No Java sources under " + root.toAbsolutePath());
            }
            return sources;
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}

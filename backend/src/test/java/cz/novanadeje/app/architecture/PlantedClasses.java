package cz.novanadeje.app.architecture;

import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;

import javax.tools.JavaCompiler;
import javax.tools.StandardJavaFileManager;
import javax.tools.ToolProvider;
import java.io.IOException;
import java.io.StringWriter;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

final class PlantedClasses {

    private PlantedClasses() {
    }

    static JavaClasses compiled(Path folder, Map<String, String> sourcesByClassName) throws IOException {
        JavaCompiler compiler = ToolProvider.getSystemJavaCompiler();
        assertThat(compiler).as("javac of the JDK toolchain").isNotNull();
        Path classes = Files.createDirectories(folder.resolve("classes"));
        List<Path> sources = written(Files.createDirectories(folder.resolve("sources")), sourcesByClassName);
        List<String> options = List.of("-proc:none", "-g", "-classpath", System.getProperty("java.class.path"), "-d", classes.toString());
        StringWriter errors = new StringWriter();
        try (StandardJavaFileManager files = compiler.getStandardFileManager(null, null, null)) {
            boolean compiled = compiler.getTask(errors, files, null, options, null, files.getJavaFileObjectsFromPaths(sources)).call();
            assertThat(compiled).as("compiling the planted classes: %s", errors).isTrue();
        }
        return new ClassFileImporter().importPath(classes);
    }

    private static List<Path> written(Path folder, Map<String, String> sourcesByClassName) throws IOException {
        List<Path> sources = new ArrayList<>();
        for (Map.Entry<String, String> planted : sourcesByClassName.entrySet()) {
            Path file = folder.resolve(planted.getKey().replace('.', '/') + ".java");
            Files.createDirectories(file.getParent());
            sources.add(Files.writeString(file, planted.getValue()));
        }
        return sources;
    }
}

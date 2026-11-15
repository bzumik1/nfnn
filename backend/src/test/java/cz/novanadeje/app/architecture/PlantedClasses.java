package cz.novanadeje.app.architecture;

import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.Location;
import com.tngtech.archunit.core.importer.Locations;
import cz.novanadeje.app.support.CompiledSources;

import java.io.IOException;
import java.nio.file.Path;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

final class PlantedClasses {

    private PlantedClasses() {
    }

    static JavaClasses compiled(Path folder, Map<String, String> sourcesByClassName) throws IOException {
        return compiled(folder, sourcesByClassName, List.of());
    }

    static JavaClasses compiled(Path folder, Map<String, String> sourcesByClassName, List<Class<?>> mainClasses) throws IOException {
        Set<Location> imported = new HashSet<>(Set.of(Location.of(CompiledSources.compiledInto(folder, sourcesByClassName))));
        mainClasses.forEach(mainClass -> imported.addAll(Locations.ofClass(mainClass)));
        return new ClassFileImporter().importLocations(imported);
    }
}

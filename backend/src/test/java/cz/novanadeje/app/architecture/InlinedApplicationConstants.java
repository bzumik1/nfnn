package cz.novanadeje.app.architecture;

import com.sun.source.tree.ClassTree;
import com.sun.source.tree.CompilationUnitTree;
import com.sun.source.tree.IdentifierTree;
import com.sun.source.tree.MemberSelectTree;
import com.sun.source.tree.VariableTree;
import com.sun.source.util.TreePath;
import com.sun.source.util.TreePathScanner;
import com.sun.source.util.Trees;
import cz.novanadeje.app.support.AttributedSources;

import javax.lang.model.element.Element;
import javax.lang.model.element.ElementKind;
import javax.lang.model.element.TypeElement;
import javax.lang.model.element.VariableElement;
import javax.lang.model.util.Elements;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.function.BiConsumer;

final class InlinedApplicationConstants {

    private static final Set<String> READING_LAYERS = Set.of("infrastructure", "interfaces");

    private static final String APPLICATION = "application";

    private static final String PACKAGE_INFO = "package-info";

    private final Trees trees;
    private final Elements elements;
    private final Map<VariableElement, TreePath> initializersByConstant = new HashMap<>();
    private final Map<VariableElement, Set<VariableElement>> applicationConstantsByConstant = new HashMap<>();

    private InlinedApplicationConstants(AttributedSources sources) {
        this.trees = sources.trees();
        this.elements = sources.elements();
    }

    static Set<String> readsIn(List<Path> sources) {
        return AttributedSources.read(sources, InlinedApplicationConstants::readsIn);
    }

    static Set<String> readsIn(AttributedSources sources) {
        return new InlinedApplicationConstants(sources).readsOf(sources.units());
    }

    private Set<String> readsOf(List<CompilationUnitTree> units) {
        units.forEach(unit -> new ConstantInitializers().scan(unit, null));
        Set<String> reads = new TreeSet<>();
        units.stream().filter(unit -> isIn(packageOf(unit), READING_LAYERS)).forEach(unit -> new FieldsRead((path, field) ->
                applicationConstantsReadThrough(field).forEach(constant -> reads.add(readerOf(packageOf(unit), path) + " reads " + nameOf(constant))))
                .scan(unit, null));
        return reads;
    }

    private static String readerOf(String packageName, TreePath path) {
        String topLevelType = PACKAGE_INFO;
        for (TreePath step = path; step != null; step = step.getParentPath()) {
            if (step.getLeaf() instanceof ClassTree type) {
                topLevelType = type.getSimpleName().toString();
            }
        }
        return packageName.isEmpty() ? topLevelType : packageName + "." + topLevelType;
    }

    private static String nameOf(VariableElement constant) {
        return ((TypeElement) constant.getEnclosingElement()).getQualifiedName() + "." + constant.getSimpleName();
    }

    private static String packageOf(CompilationUnitTree unit) {
        return unit.getPackageName() == null ? "" : unit.getPackageName().toString();
    }

    private static boolean isIn(String packageName, Set<String> layers) {
        return ExceptionMessageValues.layerOf(packageName).filter(layers::contains).isPresent();
    }

    private Set<VariableElement> applicationConstantsReadThrough(VariableElement field) {
        if (field.getKind() != ElementKind.FIELD || field.getConstantValue() == null) {
            return Set.of();
        }
        if (isIn(elements.getPackageOf(field).getQualifiedName().toString(), Set.of(APPLICATION))) {
            return Set.of(field);
        }
        Set<VariableElement> known = applicationConstantsByConstant.get(field);
        if (known != null) {
            return known;
        }
        applicationConstantsByConstant.put(field, Set.of());
        Set<VariableElement> passedOn = new HashSet<>();
        TreePath initializer = initializersByConstant.get(field);
        if (initializer != null) {
            new FieldsRead((path, read) -> passedOn.addAll(applicationConstantsReadThrough(read))).scan(initializer, null);
        }
        applicationConstantsByConstant.put(field, Set.copyOf(passedOn));
        return passedOn;
    }

    private final class FieldsRead extends TreePathScanner<Void, Void> {

        private final BiConsumer<TreePath, VariableElement> reader;

        private FieldsRead(BiConsumer<TreePath, VariableElement> reader) {
            this.reader = reader;
        }

        @Override
        public Void visitIdentifier(IdentifierTree tree, Void unused) {
            readFieldAt(getCurrentPath());
            return super.visitIdentifier(tree, unused);
        }

        @Override
        public Void visitMemberSelect(MemberSelectTree tree, Void unused) {
            readFieldAt(getCurrentPath());
            return super.visitMemberSelect(tree, unused);
        }

        private void readFieldAt(TreePath path) {
            if (trees.getElement(path) instanceof VariableElement field) {
                reader.accept(path, field);
            }
        }
    }

    private final class ConstantInitializers extends TreePathScanner<Void, Void> {

        @Override
        public Void visitVariable(VariableTree tree, Void unused) {
            Element element = trees.getElement(getCurrentPath());
            if (tree.getInitializer() != null && element instanceof VariableElement field && field.getKind() == ElementKind.FIELD
                    && field.getConstantValue() != null) {
                initializersByConstant.put(field, new TreePath(getCurrentPath(), tree.getInitializer()));
            }
            return super.visitVariable(tree, unused);
        }
    }
}

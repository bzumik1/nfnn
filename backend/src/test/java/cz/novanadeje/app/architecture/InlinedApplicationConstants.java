package cz.novanadeje.app.architecture;

import com.sun.source.tree.ClassTree;
import com.sun.source.tree.CompilationUnitTree;
import com.sun.source.tree.IdentifierTree;
import com.sun.source.tree.ImportTree;
import com.sun.source.tree.MemberSelectTree;
import com.sun.source.util.TreePath;
import com.sun.source.util.TreePathScanner;
import com.sun.source.util.Trees;
import cz.novanadeje.app.support.AttributedSources;

import javax.lang.model.element.Element;
import javax.lang.model.element.ElementKind;
import javax.lang.model.element.Modifier;
import javax.lang.model.element.TypeElement;
import javax.lang.model.element.VariableElement;
import javax.lang.model.util.Elements;
import java.nio.file.Path;
import java.util.ArrayDeque;
import java.util.Arrays;
import java.util.Deque;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;

final class InlinedApplicationConstants {

    private static final Set<String> READING_LAYERS = Set.of("infrastructure", "interfaces");

    private final Trees trees;
    private final Elements elements;

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
        Set<String> reads = new TreeSet<>();
        units.stream().filter(unit -> isIn(packageOf(unit), READING_LAYERS)).forEach(unit -> new Reads(reads).scan(unit, null));
        return reads;
    }

    private static String packageOf(CompilationUnitTree unit) {
        return unit.getPackageName() == null ? "" : unit.getPackageName().toString();
    }

    private static boolean isIn(String packageName, Set<String> layers) {
        return Arrays.stream(packageName.split("\\.")).anyMatch(layers::contains);
    }

    private final class Reads extends TreePathScanner<Void, Void> {

        private final Set<String> reads;
        private final Deque<TypeElement> readers = new ArrayDeque<>();

        private Reads(Set<String> reads) {
            this.reads = reads;
        }

        @Override
        public Void visitImport(ImportTree tree, Void unused) {
            return null;
        }

        @Override
        public Void visitClass(ClassTree tree, Void unused) {
            readers.push((TypeElement) trees.getElement(getCurrentPath()));
            try {
                return super.visitClass(tree, unused);
            } finally {
                readers.pop();
            }
        }

        @Override
        public Void visitIdentifier(IdentifierTree tree, Void unused) {
            record(getCurrentPath());
            return super.visitIdentifier(tree, unused);
        }

        @Override
        public Void visitMemberSelect(MemberSelectTree tree, Void unused) {
            record(getCurrentPath());
            return super.visitMemberSelect(tree, unused);
        }

        private void record(TreePath path) {
            Element element = trees.getElement(path);
            if (element instanceof VariableElement field && isAnInlinedConstantOfTheApplication(field)) {
                TypeElement owner = (TypeElement) field.getEnclosingElement();
                reads.add(elements.getOutermostTypeElement(readers.peek()).getQualifiedName() + " reads " + owner.getQualifiedName() + "." + field.getSimpleName());
            }
        }

        private boolean isAnInlinedConstantOfTheApplication(VariableElement field) {
            return field.getKind() == ElementKind.FIELD
                    && field.getModifiers().contains(Modifier.STATIC)
                    && field.getConstantValue() != null
                    && isIn(elements.getPackageOf(field).getQualifiedName().toString(), Set.of("application"));
        }
    }
}

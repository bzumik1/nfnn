package cz.novanadeje.app.architecture;

import com.sun.source.tree.AssignmentTree;
import com.sun.source.tree.BinaryTree;
import com.sun.source.tree.ClassTree;
import com.sun.source.tree.CompilationUnitTree;
import com.sun.source.tree.CompoundAssignmentTree;
import com.sun.source.tree.ConditionalExpressionTree;
import com.sun.source.tree.ExpressionStatementTree;
import com.sun.source.tree.ExpressionTree;
import com.sun.source.tree.IdentifierTree;
import com.sun.source.tree.LambdaExpressionTree;
import com.sun.source.tree.LiteralTree;
import com.sun.source.tree.MemberReferenceTree;
import com.sun.source.tree.MemberSelectTree;
import com.sun.source.tree.MethodInvocationTree;
import com.sun.source.tree.MethodTree;
import com.sun.source.tree.NewArrayTree;
import com.sun.source.tree.NewClassTree;
import com.sun.source.tree.ParenthesizedTree;
import com.sun.source.tree.StatementTree;
import com.sun.source.tree.Tree;
import com.sun.source.tree.TypeCastTree;
import com.sun.source.tree.VariableTree;
import com.sun.source.util.JavacTask;
import com.sun.source.util.TreePath;
import com.sun.source.util.TreePathScanner;
import com.sun.source.util.Trees;

import javax.lang.model.element.Element;
import javax.lang.model.element.ElementKind;
import javax.lang.model.element.ExecutableElement;
import javax.lang.model.element.Modifier;
import javax.lang.model.element.TypeElement;
import javax.lang.model.element.VariableElement;
import javax.lang.model.type.ArrayType;
import javax.lang.model.type.DeclaredType;
import javax.lang.model.type.TypeKind;
import javax.lang.model.type.TypeMirror;
import javax.lang.model.util.ElementFilter;
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
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.stream.Stream;

final class ExceptionMessageValues {

    private static final Set<String> MESSAGE_LAYERS = Set.of("domain", "application");

    private static final Set<String> CLOSED_JDK_TYPES = Set.of(
            "java.lang.Class",
            "java.lang.Enum",
            "java.math.BigDecimal",
            "java.math.BigInteger",
            "java.util.UUID",
            "java.util.Locale",
            "java.util.Currency");

    private static final Set<String> CLOSED_JDK_PACKAGES = Set.of("java.time", "java.time.temporal", "java.time.chrono");

    private static final Set<String> CONTAINER_TYPES = Set.of(
            "java.util.Optional",
            "java.util.Collection",
            "java.util.Map",
            "java.lang.Iterable",
            "java.util.stream.Stream");

    private final Trees trees;
    private final Types types;
    private final Elements elements;
    private final TypeMirror throwable;
    private final Map<ExecutableElement, List<Forwarding>> forwardingsByConstructor = new HashMap<>();
    private final Map<VariableElement, List<TreePath>> feedsByVariable = new HashMap<>();
    private final Set<VariableElement> unsettledVariables = new HashSet<>();
    private final Set<ExecutableElement> calledExecutables = new HashSet<>();
    private final Map<TypeElement, Boolean> openSiteTypes = new HashMap<>();
    private Set<ParameterSlot> messageParameters = Set.of();
    private Set<VariableElement> closedVariables = Set.of();

    private ExceptionMessageValues(JavacTask task) {
        this.trees = Trees.instance(task);
        this.types = task.getTypes();
        this.elements = task.getElements();
        this.throwable = elements.getTypeElement("java.lang.Throwable").asType();
    }

    static List<Path> javaSources(Path root) {
        try (Stream<Path> files = Files.walk(root)) {
            return files.filter(Files::isRegularFile).filter(file -> file.toString().endsWith(".java")).sorted().toList();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    static List<String> foundIn(List<Path> sources) {
        JavaCompiler compiler = ToolProvider.getSystemJavaCompiler();
        if (compiler == null) {
            throw new IllegalStateException("The rule needs javac of the JDK toolchain");
        }
        DiagnosticCollector<JavaFileObject> diagnostics = new DiagnosticCollector<>();
        try (StandardJavaFileManager files = compiler.getStandardFileManager(diagnostics, Locale.ROOT, StandardCharsets.UTF_8)) {
            List<String> options = List.of("-proc:none", "-classpath", System.getProperty("java.class.path"));
            JavacTask task = (JavacTask) compiler.getTask(null, files, diagnostics, options, null, files.getJavaFileObjectsFromPaths(sources));
            List<CompilationUnitTree> units = new ArrayList<>();
            task.parse().forEach(units::add);
            task.analyze();
            refuseCompilationErrors(diagnostics);
            return new ExceptionMessageValues(task).reportsOf(units);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private static boolean liesInAMessageLayer(CompilationUnitTree unit) {
        for (Path part : Path.of(unit.getSourceFile().toUri())) {
            if (MESSAGE_LAYERS.contains(part.toString())) {
                return true;
            }
        }
        return false;
    }

    private static void refuseCompilationErrors(DiagnosticCollector<JavaFileObject> diagnostics) {
        List<String> errors = diagnostics.getDiagnostics().stream()
                .filter(diagnostic -> diagnostic.getKind() == Diagnostic.Kind.ERROR)
                .map(diagnostic -> diagnostic.getMessage(Locale.ROOT))
                .toList();
        if (!errors.isEmpty()) {
            throw new IllegalStateException("The sources do not compile, so the rule would see no types: " + errors);
        }
    }

    private List<String> reportsOf(List<CompilationUnitTree> units) {
        units.forEach(unit -> new Declarations().scan(unit, null));
        messageParameters = messageParametersOfThrowableConstructors();
        closedVariables = variablesFedOnlyClosedValues();
        List<String> reports = new ArrayList<>();
        units.stream().filter(ExceptionMessageValues::liesInAMessageLayer).forEach(unit -> new MessageSites(unit, reports).scan(unit, null));
        return reports;
    }

    private Set<ParameterSlot> messageParametersOfThrowableConstructors() {
        Set<ParameterSlot> found = new HashSet<>();
        boolean grown = true;
        while (grown) {
            grown = false;
            for (Map.Entry<ExecutableElement, List<Forwarding>> constructor : forwardingsByConstructor.entrySet()) {
                for (Forwarding forwarding : constructor.getValue()) {
                    ParameterSlot slot = new ParameterSlot(constructor.getKey(), forwarding.parameterIndex());
                    if (!found.contains(slot) && reachesAMessage(forwarding.target(), forwarding.argumentIndex(), found)) {
                        found.add(slot);
                        grown = true;
                    }
                }
            }
        }
        return Set.copyOf(found);
    }

    private boolean reachesAMessage(ExecutableElement target, int argumentIndex, Set<ParameterSlot> knownMessages) {
        if (forwardingsByConstructor.containsKey(target)) {
            return knownMessages.contains(new ParameterSlot(target, argumentIndex));
        }
        return argumentIndex < target.getParameters().size() && !isThrowable(target.getParameters().get(argumentIndex).asType());
    }

    private Set<VariableElement> variablesFedOnlyClosedValues() {
        Set<VariableElement> closed = new HashSet<>(feedsByVariable.keySet());
        closed.removeAll(unsettledVariables);
        closed.removeIf(variable -> variable.getKind() == ElementKind.PARAMETER && !calledExecutables.contains(variable.getEnclosingElement()));
        closedVariables = closed;
        boolean shrunk = true;
        while (shrunk) {
            shrunk = false;
            for (VariableElement variable : List.copyOf(closed)) {
                if (feedsByVariable.get(variable).stream().anyMatch(this::carriesAnOpenValue)) {
                    closed.remove(variable);
                    shrunk = true;
                }
            }
        }
        return Set.copyOf(closed);
    }

    private boolean isMessageArgument(ExecutableElement constructor, int argumentIndex, TypeMirror argumentType) {
        if (forwardingsByConstructor.containsKey(constructor)) {
            return messageParameters.contains(new ParameterSlot(constructor, argumentIndex));
        }
        return !isThrowable(argumentType);
    }

    private boolean carriesAnOpenValue(TreePath path) {
        ExpressionTree expression = (ExpressionTree) path.getLeaf();
        if (isConstant(path)) {
            return false;
        }
        return switch (expression) {
            case ParenthesizedTree parenthesized -> carriesAnOpenValue(child(path, parenthesized.getExpression()));
            case TypeCastTree cast -> carriesAnOpenValue(child(path, cast.getExpression()));
            case ConditionalExpressionTree conditional ->
                    carriesAnOpenValue(child(path, conditional.getTrueExpression())) || carriesAnOpenValue(child(path, conditional.getFalseExpression()));
            case BinaryTree binary when binary.getKind() == Tree.Kind.PLUS ->
                    carriesAnOpenValue(child(path, binary.getLeftOperand())) || carriesAnOpenValue(child(path, binary.getRightOperand()));
            case BinaryTree ignored -> false;
            case MethodInvocationTree invocation -> invocationCarriesAnOpenValue(path, invocation);
            case NewClassTree creation -> !isThrowable(trees.getTypeMirror(path)) && anyCarriesAnOpenValue(path, creation.getArguments());
            case NewArrayTree array -> array.getInitializers() != null && anyCarriesAnOpenValue(path, array.getInitializers());
            case IdentifierTree ignored -> holdsAnOpenValue(path);
            case MemberSelectTree ignored -> holdsAnOpenValue(path);
            case LambdaExpressionTree ignored -> false;
            case MemberReferenceTree ignored -> false;
            default -> hasAnOpenType(path);
        };
    }

    private boolean anyCarriesAnOpenValue(TreePath parent, List<? extends ExpressionTree> expressions) {
        return expressions.stream().anyMatch(expression -> carriesAnOpenValue(child(parent, expression)));
    }

    private boolean invocationCarriesAnOpenValue(TreePath path, MethodInvocationTree invocation) {
        if (!hasAnOpenType(path)) {
            return false;
        }
        if (anyCarriesAnOpenValue(path, invocation.getArguments())) {
            return true;
        }
        if (invocation.getMethodSelect() instanceof MemberSelectTree select) {
            TreePath receiver = child(child(path, select), select.getExpression());
            return !namesAType(receiver) && carriesAnOpenValue(receiver);
        }
        Element method = trees.getElement(path);
        return method != null && !method.getModifiers().contains(Modifier.STATIC) && isOpen(method.getEnclosingElement().asType());
    }

    private boolean holdsAnOpenValue(TreePath path) {
        Element element = trees.getElement(path);
        if (element == null || element.getKind().isClass() || element.getKind().isInterface() || element.getKind() == ElementKind.PACKAGE) {
            return false;
        }
        if (element instanceof VariableElement variable && closedVariables.contains(variable)) {
            return false;
        }
        return hasAnOpenType(path);
    }

    private boolean hasAnOpenType(TreePath path) {
        TypeMirror type = trees.getTypeMirror(path);
        return type != null && isOpen(type);
    }

    private boolean namesAType(TreePath path) {
        Element element = trees.getElement(path);
        return element != null && (element.getKind().isClass() || element.getKind().isInterface() || element.getKind() == ElementKind.PACKAGE);
    }

    private boolean isConstant(TreePath path) {
        return switch (path.getLeaf()) {
            case LiteralTree ignored -> true;
            case ParenthesizedTree parenthesized -> isConstant(child(path, parenthesized.getExpression()));
            case BinaryTree binary -> isConstant(child(path, binary.getLeftOperand())) && isConstant(child(path, binary.getRightOperand()));
            case IdentifierTree ignored -> namesAConstant(path);
            case MemberSelectTree ignored -> namesAConstant(path);
            default -> false;
        };
    }

    private boolean namesAConstant(TreePath path) {
        return trees.getElement(path) instanceof VariableElement variable && variable.getConstantValue() != null;
    }

    private static TreePath child(TreePath parent, Tree leaf) {
        return new TreePath(parent, leaf);
    }

    private boolean isThrowable(TypeMirror type) {
        return type != null && type.getKind() == TypeKind.DECLARED && types.isAssignable(types.erasure(type), throwable);
    }

    private boolean isOpen(TypeMirror type) {
        return isOpen(type, new HashSet<>());
    }

    private boolean isOpen(TypeMirror type, Set<TypeElement> visiting) {
        return switch (type.getKind()) {
            case BOOLEAN, BYTE, SHORT, INT, LONG, FLOAT, DOUBLE, CHAR, VOID, NULL -> false;
            case ARRAY -> isOpenArray((ArrayType) type, visiting);
            case DECLARED -> isOpenDeclared((DeclaredType) type, visiting);
            default -> true;
        };
    }

    private boolean isOpenArray(ArrayType type, Set<TypeElement> visiting) {
        TypeKind component = type.getComponentType().getKind();
        return component == TypeKind.CHAR || component == TypeKind.BYTE || isOpen(type.getComponentType(), visiting);
    }

    private boolean isOpenDeclared(DeclaredType type, Set<TypeElement> visiting) {
        TypeElement element = (TypeElement) type.asElement();
        String name = element.getQualifiedName().toString();
        if (element.getKind() == ElementKind.ENUM || isBoxOrNumber(type) || CLOSED_JDK_TYPES.contains(name)
                || CLOSED_JDK_PACKAGES.contains(elements.getPackageOf(element).getQualifiedName().toString())) {
            return false;
        }
        if (isContainer(type)) {
            return type.getTypeArguments().isEmpty() || type.getTypeArguments().stream().anyMatch(argument -> isOpen(argument, visiting));
        }
        if (name.startsWith("java.") || name.startsWith("javax.")) {
            return true;
        }
        return isOpenSiteType(element, visiting);
    }

    private boolean isBoxOrNumber(DeclaredType type) {
        if (types.isAssignable(types.erasure(type), elements.getTypeElement("java.lang.Number").asType())) {
            return true;
        }
        try {
            return types.unboxedType(type).getKind().isPrimitive();
        } catch (IllegalArgumentException notABox) {
            return false;
        }
    }

    private boolean isContainer(DeclaredType type) {
        TypeMirror erased = types.erasure(type);
        return CONTAINER_TYPES.stream()
                .map(elements::getTypeElement)
                .anyMatch(container -> types.isAssignable(erased, types.erasure(container.asType())));
    }

    private boolean isOpenSiteType(TypeElement element, Set<TypeElement> visiting) {
        Boolean known = openSiteTypes.get(element);
        if (known != null) {
            return known;
        }
        if (!visiting.add(element)) {
            return false;
        }
        boolean open = switch (element.getKind()) {
            case RECORD -> element.getRecordComponents().stream().anyMatch(component -> isOpen(component.asType(), visiting));
            case CLASS -> ElementFilter.fieldsIn(element.getEnclosedElements()).stream()
                    .filter(field -> !field.getModifiers().contains(Modifier.STATIC))
                    .anyMatch(field -> isOpen(field.asType(), visiting));
            default -> true;
        };
        visiting.remove(element);
        openSiteTypes.put(element, open);
        return open;
    }

    private boolean overridesAnother(ExecutableElement method) {
        TypeElement owner = (TypeElement) method.getEnclosingElement();
        Deque<TypeMirror> supertypes = new ArrayDeque<>(types.directSupertypes(owner.asType()));
        Set<Element> seen = new HashSet<>();
        while (!supertypes.isEmpty()) {
            Element supertype = types.asElement(supertypes.pop());
            if (supertype == null || !seen.add(supertype)) {
                continue;
            }
            for (ExecutableElement candidate : ElementFilter.methodsIn(supertype.getEnclosedElements())) {
                if (elements.overrides(method, candidate, owner)) {
                    return true;
                }
            }
            supertypes.addAll(types.directSupertypes(supertype.asType()));
        }
        return false;
    }

    private record ParameterSlot(ExecutableElement constructor, int index) {
    }

    private record Forwarding(int parameterIndex, ExecutableElement target, int argumentIndex) {
    }

    private final class Declarations extends TreePathScanner<Void, Void> {

        @Override
        public Void visitMethod(MethodTree method, Void unused) {
            if (trees.getElement(getCurrentPath()) instanceof ExecutableElement executable) {
                if (executable.getKind() == ElementKind.CONSTRUCTOR && isThrowable(executable.getEnclosingElement().asType())) {
                    forwardingsByConstructor.put(executable, forwardingsOf(executable, method));
                }
                if (isReachedOutsideTheSources(executable)) {
                    unsettledVariables.addAll(executable.getParameters());
                }
            }
            return super.visitMethod(method, unused);
        }

        @Override
        public Void visitMethodInvocation(MethodInvocationTree invocation, Void unused) {
            feedParameters(trees.getElement(getCurrentPath()), invocation.getArguments());
            return super.visitMethodInvocation(invocation, unused);
        }

        @Override
        public Void visitNewClass(NewClassTree creation, Void unused) {
            feedParameters(trees.getElement(getCurrentPath()), creation.getArguments());
            return super.visitNewClass(creation, unused);
        }

        @Override
        public Void visitLambdaExpression(LambdaExpressionTree lambda, Void unused) {
            lambda.getParameters().forEach(parameter -> {
                if (trees.getElement(child(getCurrentPath(), parameter)) instanceof VariableElement variable) {
                    unsettledVariables.add(variable);
                }
            });
            return super.visitLambdaExpression(lambda, unused);
        }

        @Override
        public Void visitMemberReference(MemberReferenceTree reference, Void unused) {
            if (trees.getElement(getCurrentPath()) instanceof ExecutableElement method) {
                unsettledVariables.addAll(method.getParameters());
            }
            return super.visitMemberReference(reference, unused);
        }

        @Override
        public Void visitAssignment(AssignmentTree assignment, Void unused) {
            feed(child(getCurrentPath(), assignment.getVariable()), assignment.getExpression());
            return super.visitAssignment(assignment, unused);
        }

        @Override
        public Void visitCompoundAssignment(CompoundAssignmentTree assignment, Void unused) {
            feed(child(getCurrentPath(), assignment.getVariable()), assignment.getExpression());
            return super.visitCompoundAssignment(assignment, unused);
        }

        @Override
        public Void visitVariable(VariableTree variable, Void unused) {
            if (variable.getInitializer() != null && trees.getElement(getCurrentPath()) instanceof VariableElement field
                    && field.getKind() == ElementKind.FIELD) {
                addFeed(field, child(getCurrentPath(), variable.getInitializer()));
            }
            return super.visitVariable(variable, unused);
        }

        private boolean isReachedOutsideTheSources(ExecutableElement executable) {
            return elements.isCanonicalConstructor(executable)
                    || executable.getAnnotationMirrors().stream().anyMatch(annotation -> !isOverride(annotation.getAnnotationType()))
                    || executable.getKind() == ElementKind.METHOD && overridesAnother(executable);
        }

        private boolean isOverride(DeclaredType annotation) {
            return ((TypeElement) annotation.asElement()).getQualifiedName().contentEquals("java.lang.Override");
        }

        private void feedParameters(Element target, List<? extends ExpressionTree> arguments) {
            if (!(target instanceof ExecutableElement executable) || executable.getParameters().isEmpty()) {
                return;
            }
            calledExecutables.add(executable);
            List<? extends VariableElement> parameters = executable.getParameters();
            for (int index = 0; index < arguments.size(); index++) {
                addFeed(parameters.get(Math.min(index, parameters.size() - 1)), child(getCurrentPath(), arguments.get(index)));
            }
        }

        private void feed(TreePath target, ExpressionTree value) {
            if (trees.getElement(target) instanceof VariableElement variable) {
                addFeed(variable, child(getCurrentPath(), value));
            }
        }

        private void addFeed(VariableElement variable, TreePath value) {
            boolean tracked = variable.getKind() == ElementKind.PARAMETER || variable.getKind() == ElementKind.FIELD;
            if (tracked && isOpen(variable.asType())) {
                feedsByVariable.computeIfAbsent(variable, ignored -> new ArrayList<>()).add(value);
                if (variable.getKind() == ElementKind.FIELD && !variable.getModifiers().contains(Modifier.FINAL)) {
                    unsettledVariables.add(variable);
                }
            }
        }

        private List<Forwarding> forwardingsOf(ExecutableElement constructor, MethodTree method) {
            if (method.getBody() == null || method.getBody().getStatements().isEmpty()) {
                return List.of();
            }
            StatementTree first = method.getBody().getStatements().getFirst();
            if (!(first instanceof ExpressionStatementTree statement)
                    || !(statement.getExpression() instanceof MethodInvocationTree invocation)
                    || !callsAnotherConstructor(invocation)) {
                return List.of();
            }
            TreePath invocationPath = child(child(child(child(getCurrentPath(), method.getBody()), statement), statement.getExpression()), invocation);
            ExecutableElement target = (ExecutableElement) trees.getElement(invocationPath);
            List<Forwarding> forwardings = new ArrayList<>();
            List<? extends ExpressionTree> arguments = invocation.getArguments();
            for (int argument = 0; argument < arguments.size(); argument++) {
                int parameter = constructor.getParameters().indexOf(trees.getElement(child(invocationPath, arguments.get(argument))));
                if (parameter >= 0) {
                    forwardings.add(new Forwarding(parameter, target, argument));
                }
            }
            return List.copyOf(forwardings);
        }
    }

    private static boolean callsAnotherConstructor(MethodInvocationTree invocation) {
        return invocation.getMethodSelect() instanceof IdentifierTree name
                && (name.getName().contentEquals("super") || name.getName().contentEquals("this"));
    }

    private final class MessageSites extends TreePathScanner<Void, Void> {

        private final CompilationUnitTree unit;
        private final List<String> reports;

        private MessageSites(CompilationUnitTree unit, List<String> reports) {
            this.unit = unit;
            this.reports = reports;
        }

        @Override
        public Void visitNewClass(NewClassTree creation, Void unused) {
            if (isThrowable(trees.getTypeMirror(getCurrentPath())) && trees.getElement(getCurrentPath()) instanceof ExecutableElement constructor) {
                checkArguments(constructor, creation.getArguments(), Set.of());
            }
            return super.visitNewClass(creation, unused);
        }

        @Override
        public Void visitMethodInvocation(MethodInvocationTree invocation, Void unused) {
            if (callsAnotherConstructor(invocation)) {
                ExecutableElement enclosing = enclosingConstructor();
                if (enclosing != null && isThrowable(enclosing.getEnclosingElement().asType())
                        && trees.getElement(getCurrentPath()) instanceof ExecutableElement target) {
                    checkArguments(target, invocation.getArguments(), Set.copyOf(enclosing.getParameters()));
                }
            }
            return super.visitMethodInvocation(invocation, unused);
        }

        private ExecutableElement enclosingConstructor() {
            MethodTree method = enclosingMethod();
            return method != null && trees.getElement(trees.getPath(unit, method)) instanceof ExecutableElement executable
                    && executable.getKind() == ElementKind.CONSTRUCTOR ? executable : null;
        }

        private MethodTree enclosingMethod() {
            for (TreePath path = getCurrentPath(); path != null; path = path.getParentPath()) {
                if (path.getLeaf() instanceof MethodTree method) {
                    return method;
                }
                if (path.getLeaf() instanceof ClassTree) {
                    return null;
                }
            }
            return null;
        }

        private void checkArguments(ExecutableElement constructor, List<? extends ExpressionTree> arguments, Set<? extends VariableElement> forwarded) {
            for (int index = 0; index < arguments.size(); index++) {
                TreePath argument = child(getCurrentPath(), arguments.get(index));
                if (trees.getElement(argument) instanceof VariableElement named && forwarded.contains(named)) {
                    continue;
                }
                if (isMessageArgument(constructor, index, trees.getTypeMirror(argument)) && carriesAnOpenValue(argument)) {
                    reports.add(siteName() + " builds the message of " + constructor.getEnclosingElement().getSimpleName()
                            + " from an open value: " + arguments.get(index) + " (" + locationOfSite() + ")");
                }
            }
        }

        private String siteName() {
            ClassTree owner = null;
            for (TreePath path = getCurrentPath(); path != null && owner == null; path = path.getParentPath()) {
                if (path.getLeaf() instanceof ClassTree type && !type.getSimpleName().isEmpty()) {
                    owner = type;
                }
            }
            MethodTree method = enclosingMethod();
            String className = owner == null ? "?" : owner.getSimpleName().toString();
            return className + "." + (method == null ? "<initializer>" : method.getName().toString());
        }

        private String locationOfSite() {
            long position = trees.getSourcePositions().getStartPosition(unit, getCurrentPath().getLeaf());
            return Path.of(unit.getSourceFile().toUri()).getFileName() + ":" + unit.getLineMap().getLineNumber(position);
        }
    }
}

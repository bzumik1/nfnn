package cz.novanadeje.app.architecture;

import com.sun.source.tree.BinaryTree;
import com.sun.source.tree.ClassTree;
import com.sun.source.tree.CompilationUnitTree;
import com.sun.source.tree.ConditionalExpressionTree;
import com.sun.source.tree.ExpressionStatementTree;
import com.sun.source.tree.ExpressionTree;
import com.sun.source.tree.IdentifierTree;
import com.sun.source.tree.LineMap;
import com.sun.source.tree.MemberSelectTree;
import com.sun.source.tree.MethodInvocationTree;
import com.sun.source.tree.MethodTree;
import com.sun.source.tree.NewArrayTree;
import com.sun.source.tree.NewClassTree;
import com.sun.source.tree.ParenthesizedTree;
import com.sun.source.tree.StatementTree;
import com.sun.source.tree.Tree;
import com.sun.source.tree.TypeCastTree;
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
import java.util.ArrayList;
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
    private final Set<ExecutableElement> scannedConstructors = new HashSet<>();
    private final Map<TypeElement, Boolean> openSiteTypes = new HashMap<>();
    private Set<ParameterSlot> messageParameters = Set.of();

    private ExceptionMessageValues(JavacTask task) {
        this.trees = Trees.instance(task);
        this.types = task.getTypes();
        this.elements = task.getElements();
        this.throwable = elements.getTypeElement("java.lang.Throwable").asType();
    }

    static List<Path> domainAndApplicationSources(Path root) {
        try (Stream<Path> files = Files.walk(root)) {
            return files.filter(Files::isRegularFile)
                    .filter(file -> file.toString().endsWith(".java"))
                    .filter(ExceptionMessageValues::liesInAMessageLayer)
                    .sorted()
                    .toList();
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

    private static boolean liesInAMessageLayer(Path file) {
        for (Path part : file) {
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
        units.forEach(unit -> new ConstructorForwardings(unit).scan(unit, null));
        messageParameters = messageParametersOfScannedConstructors();
        List<String> reports = new ArrayList<>();
        units.forEach(unit -> new MessageSites(unit, reports).scan(unit, null));
        return reports;
    }

    private Set<ParameterSlot> messageParametersOfScannedConstructors() {
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
        if (scannedConstructors.contains(target)) {
            return knownMessages.contains(new ParameterSlot(target, argumentIndex));
        }
        return argumentIndex < target.getParameters().size() && !isThrowable(target.getParameters().get(argumentIndex).asType());
    }

    private boolean isMessageArgument(ExecutableElement constructor, int argumentIndex, TypeMirror argumentType) {
        if (scannedConstructors.contains(constructor)) {
            return messageParameters.contains(new ParameterSlot(constructor, argumentIndex));
        }
        return !isThrowable(argumentType);
    }

    private boolean isThrowable(TypeMirror type) {
        return type.getKind() == TypeKind.DECLARED && types.isAssignable(types.erasure(type), throwable);
    }

    private boolean isOpen(TypeMirror type) {
        return isOpen(type, new HashSet<>());
    }

    private boolean isOpen(TypeMirror type, Set<TypeElement> visiting) {
        return switch (type.getKind()) {
            case BOOLEAN, BYTE, SHORT, INT, LONG, FLOAT, DOUBLE, VOID, NULL -> false;
            case CHAR -> false;
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
        TypeMirror number = elements.getTypeElement("java.lang.Number").asType();
        TypeMirror erased = types.erasure(type);
        if (types.isAssignable(erased, number)) {
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

    private record ParameterSlot(ExecutableElement constructor, int index) {
    }

    private record Forwarding(int parameterIndex, ExecutableElement target, int argumentIndex) {
    }

    private final class ConstructorForwardings extends TreePathScanner<Void, Void> {

        private final CompilationUnitTree unit;

        private ConstructorForwardings(CompilationUnitTree unit) {
            this.unit = unit;
        }

        @Override
        public Void visitMethod(MethodTree method, Void unused) {
            Element element = trees.getElement(getCurrentPath());
            if (element instanceof ExecutableElement constructor && constructor.getKind() == ElementKind.CONSTRUCTOR
                    && isThrowable(constructor.getEnclosingElement().asType())) {
                scannedConstructors.add(constructor);
                forwardingsByConstructor.put(constructor, forwardingsOf(constructor, method));
            }
            return super.visitMethod(method, unused);
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
            ExecutableElement target = (ExecutableElement) trees.getElement(TreePath.getPath(unit, invocation));
            List<Forwarding> forwardings = new ArrayList<>();
            List<? extends ExpressionTree> arguments = invocation.getArguments();
            for (int argument = 0; argument < arguments.size(); argument++) {
                int parameter = constructor.getParameters().indexOf(trees.getElement(TreePath.getPath(unit, arguments.get(argument))));
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
            TypeMirror created = trees.getTypeMirror(getCurrentPath());
            if (created != null && isThrowable(created)) {
                ExecutableElement constructor = (ExecutableElement) trees.getElement(getCurrentPath());
                checkArguments(creation, constructor, creation.getArguments(), Set.of());
            }
            return super.visitNewClass(creation, unused);
        }

        @Override
        public Void visitMethodInvocation(MethodInvocationTree invocation, Void unused) {
            if (callsAnotherConstructor(invocation)) {
                Element element = trees.getElement(getCurrentPath());
                ExecutableElement enclosing = enclosingConstructor();
                if (element instanceof ExecutableElement target && enclosing != null && isThrowable(enclosing.getEnclosingElement().asType())) {
                    checkArguments(invocation, target, invocation.getArguments(), Set.copyOf(enclosing.getParameters()));
                }
            }
            return super.visitMethodInvocation(invocation, unused);
        }

        private ExecutableElement enclosingConstructor() {
            for (TreePath path = getCurrentPath(); path != null; path = path.getParentPath()) {
                if (path.getLeaf() instanceof MethodTree) {
                    Element element = trees.getElement(path);
                    return element instanceof ExecutableElement constructor && constructor.getKind() == ElementKind.CONSTRUCTOR ? constructor : null;
                }
                if (path.getLeaf() instanceof ClassTree) {
                    return null;
                }
            }
            return null;
        }

        private void checkArguments(Tree site, ExecutableElement constructor, List<? extends ExpressionTree> arguments,
                Set<? extends VariableElement> forwardedParameters) {
            for (int index = 0; index < arguments.size(); index++) {
                ExpressionTree argument = arguments.get(index);
                TreePath path = TreePath.getPath(unit, argument);
                Element named = trees.getElement(path);
                if (named != null && forwardedParameters.contains(named)) {
                    continue;
                }
                if (isMessageArgument(constructor, index, trees.getTypeMirror(path)) && carriesAnOpenValue(argument)) {
                    reports.add(locationOf(site) + " builds the message of " + constructor.getEnclosingElement().getSimpleName()
                            + " from an open value: " + argument);
                }
            }
        }

        private boolean carriesAnOpenValue(ExpressionTree expression) {
            if (isConstant(expression)) {
                return false;
            }
            return switch (expression) {
                case ParenthesizedTree parenthesized -> carriesAnOpenValue(parenthesized.getExpression());
                case TypeCastTree cast -> carriesAnOpenValue(cast.getExpression());
                case ConditionalExpressionTree conditional ->
                        carriesAnOpenValue(conditional.getTrueExpression()) || carriesAnOpenValue(conditional.getFalseExpression());
                case BinaryTree binary when binary.getKind() == Tree.Kind.PLUS ->
                        carriesAnOpenValue(binary.getLeftOperand()) || carriesAnOpenValue(binary.getRightOperand());
                case BinaryTree ignored -> false;
                case MethodInvocationTree invocation -> invocationCarriesAnOpenValue(invocation);
                case NewClassTree creation -> !isThrowable(trees.getTypeMirror(TreePath.getPath(unit, creation)))
                        && creation.getArguments().stream().anyMatch(this::carriesAnOpenValue);
                case NewArrayTree array -> array.getInitializers() != null && array.getInitializers().stream().anyMatch(this::carriesAnOpenValue);
                case IdentifierTree identifier -> holdsAnOpenValue(identifier);
                case MemberSelectTree select -> holdsAnOpenValue(select);
                default -> false;
            };
        }

        private boolean invocationCarriesAnOpenValue(MethodInvocationTree invocation) {
            TypeMirror result = trees.getTypeMirror(TreePath.getPath(unit, invocation));
            if (result != null && !isOpen(result)) {
                return false;
            }
            if (invocation.getArguments().stream().anyMatch(this::carriesAnOpenValue)) {
                return true;
            }
            return switch (invocation.getMethodSelect()) {
                case MemberSelectTree select -> !isTypeName(select.getExpression()) && carriesAnOpenValue(select.getExpression());
                default -> implicitReceiverIsOpen(invocation);
            };
        }

        private boolean implicitReceiverIsOpen(MethodInvocationTree invocation) {
            Element method = trees.getElement(TreePath.getPath(unit, invocation));
            if (method == null || method.getModifiers().contains(Modifier.STATIC)) {
                return false;
            }
            return isOpen(method.getEnclosingElement().asType());
        }

        private boolean isTypeName(ExpressionTree expression) {
            Element element = trees.getElement(TreePath.getPath(unit, expression));
            return element != null && (element.getKind().isClass() || element.getKind().isInterface() || element.getKind() == ElementKind.PACKAGE);
        }

        private boolean holdsAnOpenValue(ExpressionTree variable) {
            TreePath path = TreePath.getPath(unit, variable);
            Element element = trees.getElement(path);
            if (element != null && (element.getKind().isClass() || element.getKind().isInterface())) {
                return false;
            }
            if (variable instanceof MemberSelectTree select && !isTypeName(select.getExpression()) && carriesAnOpenValue(select.getExpression())) {
                return true;
            }
            TypeMirror type = trees.getTypeMirror(path);
            return type != null && isOpen(type);
        }

        private boolean isConstant(ExpressionTree expression) {
            return switch (expression) {
                case ParenthesizedTree parenthesized -> isConstant(parenthesized.getExpression());
                case BinaryTree binary -> isConstant(binary.getLeftOperand()) && isConstant(binary.getRightOperand());
                case IdentifierTree identifier -> namesAConstant(identifier);
                case MemberSelectTree select -> namesAConstant(select);
                default -> expression.getKind() == Tree.Kind.STRING_LITERAL || expression instanceof com.sun.source.tree.LiteralTree;
            };
        }

        private boolean namesAConstant(ExpressionTree variable) {
            return trees.getElement(TreePath.getPath(unit, variable)) instanceof VariableElement field && field.getConstantValue() != null;
        }

        private String locationOf(Tree site) {
            LineMap lines = unit.getLineMap();
            long position = trees.getSourcePositions().getStartPosition(unit, site);
            return unit.getSourceFile().getName().replaceFirst(".*/(?=[^/]+$)", "") + ":" + lines.getLineNumber(position);
        }
    }
}

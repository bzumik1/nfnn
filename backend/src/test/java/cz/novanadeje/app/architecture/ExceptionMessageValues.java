package cz.novanadeje.app.architecture;

import com.sun.source.tree.AssignmentTree;
import com.sun.source.tree.BinaryTree;
import com.sun.source.tree.CaseTree;
import com.sun.source.tree.ClassTree;
import com.sun.source.tree.CompilationUnitTree;
import com.sun.source.tree.CompoundAssignmentTree;
import com.sun.source.tree.ConditionalExpressionTree;
import com.sun.source.tree.EnhancedForLoopTree;
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
import com.sun.source.tree.ReturnTree;
import com.sun.source.tree.StatementTree;
import com.sun.source.tree.SwitchExpressionTree;
import com.sun.source.tree.Tree;
import com.sun.source.tree.TypeCastTree;
import com.sun.source.tree.VariableTree;
import com.sun.source.tree.YieldTree;
import com.sun.source.util.TreePath;
import com.sun.source.util.TreePathScanner;
import com.sun.source.util.Trees;
import cz.novanadeje.app.support.AttributedSources;

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
import java.nio.file.Path;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Deque;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TreeMap;
import java.util.stream.Collectors;
import java.util.stream.Stream;

final class ExceptionMessageValues {

    private static final List<String> LAYERS = List.of("domain", "application", "infrastructure", "interfaces");

    private static final Set<String> MESSAGE_LAYERS = Set.of("domain", "application");

    private static final Set<String> CLOSED_JDK_TYPES = Set.of(
            "java.lang.Class",
            "java.lang.Enum",
            "java.util.UUID",
            "java.util.Locale",
            "java.util.Currency");

    private static final Set<String> OPEN_SITE_TYPES = Set.of("cz.novanadeje.app.shared.domain.Money");

    static final Set<String> CLOSED_SITE_TYPES = Set.of(
            "cz.novanadeje.app.donations.domain.receipt.ReceiptNumber",
            "cz.novanadeje.app.donations.domain.signing.ReceiptSigningKeyId");

    private static final Set<String> CONVERSION_FACTORY_NAMES = Set.of("from", "of", "valueOf", "fromString");

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
    private final Map<ExecutableElement, TreePath> declarationsByMethod = new HashMap<>();
    private final Map<ExecutableElement, List<ExecutableElement>> overridersByMethod = new HashMap<>();
    private final Set<TypeElement> declaredTypes = new HashSet<>();
    private final Map<ExecutableElement, Boolean> openResultsByMethod = new HashMap<>();
    private final Walk<ExecutableElement> methodWalk = new Walk<>();
    private final Map<VariableElement, List<TreePath>> feedsByVariable = new HashMap<>();
    private final Set<VariableElement> unsettledVariables = new HashSet<>();
    private final Set<ExecutableElement> calledExecutables = new HashSet<>();
    private final Map<TypeElement, Boolean> openSiteTypes = new HashMap<>();
    private final Map<String, Integer> checkedSitesByLayer = new TreeMap<>();
    private Set<ParameterSlot> messageParameters = Set.of();
    private Set<ParameterSlot> messageParametersEndingInAMessageLayer = Set.of();
    private Set<VariableElement> closedVariables = Set.of();

    private ExceptionMessageValues(AttributedSources sources) {
        this.trees = sources.trees();
        this.types = sources.types();
        this.elements = sources.elements();
        this.throwable = elements.getTypeElement("java.lang.Throwable").asType();
        refuseUnknownSiteTypes();
    }

    private void refuseUnknownSiteTypes() {
        List<String> unknown = Stream.concat(OPEN_SITE_TYPES.stream(), CLOSED_SITE_TYPES.stream())
                .filter(name -> elements.getTypeElement(name) == null)
                .toList();
        if (!unknown.isEmpty()) {
            throw new IllegalStateException("The rule names site types that no longer exist: " + unknown);
        }
    }

    record Scan(List<String> reports, Map<String, Integer> checkedSitesByLayer) {
    }

    static Scan scan(List<Path> sources) {
        return AttributedSources.read(sources, ExceptionMessageValues::scan);
    }

    static Scan scan(AttributedSources sources) {
        return new ExceptionMessageValues(sources).scanOf(sources.units());
    }

    private static Optional<String> layerOf(CompilationUnitTree unit) {
        return unit.getPackageName() == null ? Optional.empty() : layerOf(unit.getPackageName().toString());
    }

    static Optional<String> layerOf(String packageName) {
        return Arrays.stream(packageName.split("\\.")).filter(LAYERS::contains).findFirst();
    }

    private boolean isDeclaredInAMessageLayer(ExecutableElement executable) {
        return layerOf(elements.getPackageOf(executable).getQualifiedName().toString()).filter(MESSAGE_LAYERS::contains).isPresent();
    }

    private Scan scanOf(List<CompilationUnitTree> units) {
        units.forEach(unit -> new Declarations().scan(unit, null));
        messageParameters = messageParametersOfThrowableConstructors();
        messageParametersEndingInAMessageLayer = messageParametersEndingInAMessageLayer();
        closedVariables = variablesFedOnlyClosedValues();
        List<String> reports = new ArrayList<>();
        for (CompilationUnitTree unit : units) {
            Optional<String> layer = layerOf(unit);
            boolean messageLayer = layer.filter(MESSAGE_LAYERS::contains).isPresent();
            new MessageSites(unit, layer, messageLayer, reports).scan(unit, null);
        }
        return new Scan(List.copyOf(reports), Map.copyOf(checkedSitesByLayer));
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

    private Set<ParameterSlot> messageParametersEndingInAMessageLayer() {
        Set<ParameterSlot> found = new HashSet<>();
        messageParameters.stream().filter(slot -> isDeclaredInAMessageLayer(slot.constructor())).forEach(found::add);
        boolean grown = true;
        while (grown) {
            grown = false;
            for (Map.Entry<ExecutableElement, List<Forwarding>> constructor : forwardingsByConstructor.entrySet()) {
                for (Forwarding forwarding : constructor.getValue()) {
                    ParameterSlot slot = new ParameterSlot(constructor.getKey(), forwarding.parameterIndex());
                    if (messageParameters.contains(slot) && !found.contains(slot)
                            && found.contains(new ParameterSlot(forwarding.target(), forwarding.argumentIndex()))) {
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
            openResultsByMethod.clear();
            for (VariableElement variable : List.copyOf(closed)) {
                if (feedsByVariable.get(variable).stream().anyMatch(this::carriesAnOpenValue)) {
                    closed.remove(variable);
                    shrunk = true;
                }
            }
        }
        openResultsByMethod.clear();
        return Set.copyOf(closed);
    }

    private boolean isMessageArgument(ExecutableElement constructor, int argumentIndex, TypeMirror argumentType) {
        if (forwardingsByConstructor.containsKey(constructor)) {
            return messageParameters.contains(new ParameterSlot(constructor, argumentIndex));
        }
        return !isThrowable(argumentType);
    }

    private boolean isForwardedMessageOfAMessageLayer(ExecutableElement constructor, int argumentIndex) {
        return messageParametersEndingInAMessageLayer.contains(new ParameterSlot(constructor, argumentIndex));
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
            case NewClassTree creation ->
                    !isThrowable(trees.getTypeMirror(path)) && (yieldsAValueOfAnOpenSiteType(path) || anyCarriesAnOpenValue(path, creation.getArguments()));
            case NewArrayTree array -> array.getInitializers() != null && anyCarriesAnOpenValue(path, array.getInitializers());
            case IdentifierTree ignored -> holdsAnOpenValue(path);
            case MemberSelectTree ignored -> holdsAnOpenValue(path);
            case LambdaExpressionTree lambda -> resultsOf(path, lambda).stream().anyMatch(this::carriesAnOpenValue);
            case SwitchExpressionTree switchExpression -> resultsOf(path, switchExpression).stream().anyMatch(this::carriesAnOpenValue);
            case MemberReferenceTree ignored -> referencesAMethodOfAnOpenResult(path);
            default -> hasAnOpenType(path);
        };
    }

    private static List<TreePath> resultsOf(TreePath path, LambdaExpressionTree lambda) {
        TreePath body = child(path, lambda.getBody());
        if (lambda.getBodyKind() == LambdaExpressionTree.BodyKind.EXPRESSION) {
            return List.of(body);
        }
        return new Results(ReturnTree.class).of(body);
    }

    private static List<TreePath> resultsOf(TreePath path, SwitchExpressionTree switchExpression) {
        List<TreePath> results = new ArrayList<>();
        for (CaseTree caseTree : switchExpression.getCases()) {
            TreePath casePath = child(path, caseTree);
            if (caseTree.getCaseKind() == CaseTree.CaseKind.RULE && caseTree.getBody() instanceof ExpressionTree expression) {
                results.add(child(casePath, expression));
            } else {
                results.addAll(new Results(YieldTree.class).of(casePath));
            }
        }
        return List.copyOf(results);
    }

    private boolean anyCarriesAnOpenValue(TreePath parent, List<? extends ExpressionTree> expressions) {
        return expressions.stream().anyMatch(expression -> carriesAnOpenValue(child(parent, expression)));
    }

    private boolean invocationCarriesAnOpenValue(TreePath path, MethodInvocationTree invocation) {
        if (yieldsAValueOfAClosedList(path)) {
            return false;
        }
        if (anyCarriesAnOpenValue(path, invocation.getArguments())) {
            return true;
        }
        if (!hasAnOpenType(path) && !yieldsACharacter(path)) {
            return false;
        }
        if (!(trees.getElement(path) instanceof ExecutableElement method)) {
            return true;
        }
        if (isOfTheJdk((TypeElement) method.getEnclosingElement()) || isGeneratedMember(method) || isARecordAccessorOutsideTheSources(method)) {
            return receiverCarriesAnOpenValue(path, invocation, method);
        }
        return yieldsAnOpenResult(method);
    }

    private boolean receiverCarriesAnOpenValue(TreePath path, MethodInvocationTree invocation, ExecutableElement method) {
        if (invocation.getMethodSelect() instanceof MemberSelectTree select) {
            TreePath receiver = child(child(path, select), select.getExpression());
            return !namesAType(receiver) && carriesAnOpenValue(receiver);
        }
        return !method.getModifiers().contains(Modifier.STATIC) && isOpen(method.getEnclosingElement().asType());
    }

    private boolean isGeneratedMember(ExecutableElement method) {
        return declaredTypes.contains((TypeElement) method.getEnclosingElement()) && !declarationsByMethod.containsKey(method);
    }

    private boolean isARecordAccessorOutsideTheSources(ExecutableElement method) {
        TypeElement owner = (TypeElement) method.getEnclosingElement();
        return !declaredTypes.contains(owner) && owner.getRecordComponents().stream().anyMatch(component -> method.equals(component.getAccessor()));
    }

    private boolean yieldsAnOpenResult(ExecutableElement method) {
        Boolean known = openResultsByMethod.get(method);
        if (known != null) {
            return known;
        }
        int cycleStart = methodWalk.path().indexOf(method);
        if (cycleStart >= 0) {
            methodWalk.cutAt(cycleStart);
            return false;
        }
        int depth = methodWalk.path().size();
        methodWalk.path().add(method);
        boolean open = ownResultsCarryAnOpenValue(method)
                || overridersByMethod.getOrDefault(method, List.of()).stream().anyMatch(this::yieldsAnOpenResult);
        methodWalk.path().removeLast();
        boolean dependsOnAMethodStillOpen = methodWalk.shallowestCut() < depth;
        if (open || !dependsOnAMethodStillOpen) {
            openResultsByMethod.put(method, open);
        }
        if (!dependsOnAMethodStillOpen) {
            methodWalk.forgetCuts();
        }
        return open;
    }

    private boolean ownResultsCarryAnOpenValue(ExecutableElement method) {
        TreePath declaration = declarationsByMethod.get(method);
        if (declaration == null || ((MethodTree) declaration.getLeaf()).getBody() == null) {
            return true;
        }
        return new Results(ReturnTree.class).of(child(declaration, ((MethodTree) declaration.getLeaf()).getBody())).stream()
                .anyMatch(this::carriesAnOpenValue);
    }

    private boolean referencesAMethodOfAnOpenResult(TreePath path) {
        if (!(trees.getElement(path) instanceof ExecutableElement method)) {
            return true;
        }
        TypeMirror result = method.getKind() == ElementKind.CONSTRUCTOR ? method.getEnclosingElement().asType() : method.getReturnType();
        return isOpen(result);
    }

    private boolean yieldsAValueOfAnOpenSiteType(TreePath path) {
        TypeMirror type = trees.getTypeMirror(path);
        return type != null && type.getKind() == TypeKind.DECLARED
                && OPEN_SITE_TYPES.contains(((TypeElement) types.asElement(type)).getQualifiedName().toString());
    }

    private boolean yieldsAValueOfAClosedList(TreePath path) {
        TypeMirror type = trees.getTypeMirror(path);
        if (type == null) {
            return false;
        }
        if (type.getKind() == TypeKind.BOOLEAN) {
            return true;
        }
        if (type.getKind() != TypeKind.DECLARED) {
            return false;
        }
        TypeElement element = (TypeElement) types.asElement(type);
        return element.getKind() == ElementKind.ENUM || element.getQualifiedName().contentEquals("java.lang.Class")
                || element.getQualifiedName().contentEquals("java.lang.Boolean");
    }

    private boolean yieldsACharacter(TreePath path) {
        TypeMirror type = trees.getTypeMirror(path);
        return type != null && (type.getKind() == TypeKind.CHAR
                || type.getKind() == TypeKind.DECLARED && ((TypeElement) types.asElement(type)).getQualifiedName().contentEquals("java.lang.Character"));
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
        return isOpen(type, new Walk<>());
    }

    private boolean isOpen(TypeMirror type, Walk<TypeElement> walk) {
        return switch (type.getKind()) {
            case BOOLEAN, BYTE, SHORT, INT, LONG, FLOAT, DOUBLE, CHAR, VOID, NULL -> false;
            case ARRAY -> isOpenArray((ArrayType) type, walk);
            case DECLARED -> isOpenDeclared((DeclaredType) type, walk);
            default -> true;
        };
    }

    private boolean isOpenArray(ArrayType type, Walk<TypeElement> walk) {
        TypeKind component = type.getComponentType().getKind();
        return component == TypeKind.CHAR || component == TypeKind.BYTE || isOpen(type.getComponentType(), walk);
    }

    private boolean isOpenDeclared(DeclaredType type, Walk<TypeElement> walk) {
        TypeElement element = (TypeElement) type.asElement();
        String name = element.getQualifiedName().toString();
        if (OPEN_SITE_TYPES.contains(name)) {
            return true;
        }
        if (isClosedByName(element) || CLOSED_SITE_TYPES.contains(name)) {
            return false;
        }
        if (isContainer(type)) {
            return type.getTypeArguments().isEmpty() || type.getTypeArguments().stream().anyMatch(argument -> isOpen(argument, walk));
        }
        if (isOfTheJdk(element)) {
            return true;
        }
        return isOpenSiteType(element, walk);
    }

    private boolean isClosedByName(TypeElement element) {
        return element.getKind() == ElementKind.ENUM || isBox(element.asType()) || CLOSED_JDK_TYPES.contains(element.getQualifiedName().toString())
                || CLOSED_JDK_PACKAGES.contains(elements.getPackageOf(element).getQualifiedName().toString());
    }

    private static boolean isOfTheJdk(TypeElement element) {
        String name = element.getQualifiedName().toString();
        return name.startsWith("java.") || name.startsWith("javax.");
    }

    private boolean isBox(TypeMirror type) {
        try {
            return types.unboxedType(type).getKind().isPrimitive();
        } catch (IllegalArgumentException notABox) {
            return false;
        }
    }

    private boolean isImmutable(TypeMirror type) {
        return isImmutable(type, new HashSet<>());
    }

    private boolean isImmutable(TypeMirror type, Set<TypeElement> visiting) {
        if (type.getKind().isPrimitive()) {
            return true;
        }
        if (type.getKind() != TypeKind.DECLARED) {
            return false;
        }
        DeclaredType declared = (DeclaredType) type;
        TypeElement element = (TypeElement) declared.asElement();
        String name = element.getQualifiedName().toString();
        if (name.equals("java.lang.String") || isClosedByName(element)) {
            return true;
        }
        if (name.equals("java.util.Optional")) {
            return declared.getTypeArguments().size() == 1 && isImmutable(declared.getTypeArguments().getFirst(), visiting);
        }
        if (isOfTheJdk(element) || element.getKind() != ElementKind.RECORD) {
            return false;
        }
        if (!visiting.add(element)) {
            return false;
        }
        boolean immutable = element.getRecordComponents().stream().allMatch(component -> isImmutable(component.asType(), visiting));
        visiting.remove(element);
        return immutable;
    }

    private boolean isContainer(DeclaredType type) {
        TypeMirror erased = types.erasure(type);
        return CONTAINER_TYPES.stream()
                .map(elements::getTypeElement)
                .anyMatch(container -> types.isAssignable(erased, types.erasure(container.asType())));
    }

    private boolean isOpenSiteType(TypeElement element, Walk<TypeElement> walk) {
        Boolean known = openSiteTypes.get(element);
        if (known != null) {
            return known;
        }
        int cycleStart = walk.path().indexOf(element);
        if (cycleStart >= 0) {
            walk.cutAt(cycleStart);
            return false;
        }
        int depth = walk.path().size();
        walk.path().add(element);
        boolean open = switch (element.getKind()) {
            case RECORD -> element.getRecordComponents().stream().anyMatch(component -> isOpen(component.asType(), walk));
            case CLASS -> isOpenClass(element, walk);
            default -> true;
        };
        walk.path().removeLast();
        boolean dependsOnATypeStillOpen = walk.shallowestCut() < depth;
        if (open || !dependsOnATypeStillOpen) {
            openSiteTypes.put(element, open);
        }
        if (!dependsOnATypeStillOpen) {
            walk.forgetCuts();
        }
        return open;
    }

    private boolean isOpenClass(TypeElement element, Walk<TypeElement> walk) {
        if (!element.getModifiers().contains(Modifier.FINAL)) {
            return true;
        }
        List<VariableElement> fields = new ArrayList<>();
        for (TypeElement owner = element; owner != null; owner = superclassOf(owner)) {
            if (isOfTheJdk(owner)) {
                if (!owner.getQualifiedName().contentEquals("java.lang.Object")) {
                    return true;
                }
                break;
            }
            ElementFilter.fieldsIn(owner.getEnclosedElements()).stream()
                    .filter(field -> !field.getModifiers().contains(Modifier.STATIC))
                    .forEach(fields::add);
        }
        return fields.stream().anyMatch(field -> isOpen(field.asType(), walk));
    }

    private TypeElement superclassOf(TypeElement element) {
        TypeMirror superclass = element.getSuperclass();
        return superclass.getKind() == TypeKind.DECLARED ? (TypeElement) types.asElement(superclass) : null;
    }

    private List<ExecutableElement> overriddenBy(ExecutableElement method) {
        TypeElement owner = (TypeElement) method.getEnclosingElement();
        Deque<TypeMirror> supertypes = new ArrayDeque<>(types.directSupertypes(owner.asType()));
        Set<Element> seen = new HashSet<>();
        List<ExecutableElement> overridden = new ArrayList<>();
        while (!supertypes.isEmpty()) {
            Element supertype = types.asElement(supertypes.pop());
            if (supertype == null || !seen.add(supertype)) {
                continue;
            }
            for (ExecutableElement candidate : ElementFilter.methodsIn(supertype.getEnclosedElements())) {
                if (elements.overrides(method, candidate, owner)) {
                    overridden.add(candidate);
                }
            }
            supertypes.addAll(types.directSupertypes(supertype.asType()));
        }
        return List.copyOf(overridden);
    }

    private record ParameterSlot(ExecutableElement constructor, int index) {
    }

    private static final class Walk<T> {

        private final List<T> path = new ArrayList<>();
        private int shallowestCut = Integer.MAX_VALUE;

        List<T> path() {
            return path;
        }

        int shallowestCut() {
            return shallowestCut;
        }

        void cutAt(int depth) {
            shallowestCut = Math.min(shallowestCut, depth);
        }

        void forgetCuts() {
            shallowestCut = Integer.MAX_VALUE;
        }
    }

    private static final class Results extends TreePathScanner<Void, Void> {

        private final Class<? extends Tree> kind;
        private final List<TreePath> found = new ArrayList<>();

        private Results(Class<? extends Tree> kind) {
            this.kind = kind;
        }

        List<TreePath> of(TreePath root) {
            scan(root, null);
            return List.copyOf(found);
        }

        @Override
        public Void visitReturn(ReturnTree returned, Void unused) {
            if (kind == ReturnTree.class && returned.getExpression() != null) {
                found.add(child(getCurrentPath(), returned.getExpression()));
            }
            return super.visitReturn(returned, unused);
        }

        @Override
        public Void visitYield(YieldTree yielded, Void unused) {
            if (kind == YieldTree.class) {
                found.add(child(getCurrentPath(), yielded.getValue()));
            }
            return super.visitYield(yielded, unused);
        }

        @Override
        public Void visitLambdaExpression(LambdaExpressionTree lambda, Void unused) {
            return null;
        }

        @Override
        public Void visitClass(ClassTree type, Void unused) {
            return null;
        }

        @Override
        public Void visitSwitchExpression(SwitchExpressionTree switchExpression, Void unused) {
            return kind == YieldTree.class ? null : super.visitSwitchExpression(switchExpression, unused);
        }
    }

    private record Forwarding(int parameterIndex, ExecutableElement target, int argumentIndex) {
    }

    private final class AssignedVariables extends TreePathScanner<Void, Void> {

        private final Set<Element> assigned = new HashSet<>();

        Set<Element> of(TreePath root) {
            scan(root, null);
            return Set.copyOf(assigned);
        }

        @Override
        public Void visitAssignment(AssignmentTree assignment, Void unused) {
            Optional.ofNullable(trees.getElement(child(getCurrentPath(), assignment.getVariable()))).ifPresent(assigned::add);
            return super.visitAssignment(assignment, unused);
        }

        @Override
        public Void visitCompoundAssignment(CompoundAssignmentTree assignment, Void unused) {
            Optional.ofNullable(trees.getElement(child(getCurrentPath(), assignment.getVariable()))).ifPresent(assigned::add);
            return super.visitCompoundAssignment(assignment, unused);
        }
    }

    private final class Declarations extends TreePathScanner<Void, Void> {

        @Override
        public Void visitClass(ClassTree type, Void unused) {
            if (trees.getElement(getCurrentPath()) instanceof TypeElement declared) {
                declaredTypes.add(declared);
                for (ExecutableElement method : ElementFilter.methodsIn(declared.getEnclosedElements())) {
                    overriddenBy(method).forEach(overridden -> overridersByMethod.computeIfAbsent(overridden, ignored -> new ArrayList<>()).add(method));
                }
            }
            return super.visitClass(type, unused);
        }

        @Override
        public Void visitMethod(MethodTree method, Void unused) {
            if (trees.getElement(getCurrentPath()) instanceof ExecutableElement executable) {
                declarationsByMethod.put(executable, getCurrentPath());
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
            if (variable.getInitializer() != null && trees.getElement(getCurrentPath()) instanceof VariableElement declared) {
                addFeed(declared, child(getCurrentPath(), variable.getInitializer()));
            }
            return super.visitVariable(variable, unused);
        }

        @Override
        public Void visitEnhancedForLoop(EnhancedForLoopTree loop, Void unused) {
            if (trees.getElement(child(getCurrentPath(), loop.getVariable())) instanceof VariableElement variable) {
                unsettledVariables.add(variable);
            }
            return super.visitEnhancedForLoop(loop, unused);
        }

        private boolean isReachedOutsideTheSources(ExecutableElement executable) {
            return elements.isCanonicalConstructor(executable)
                    || executable.getAnnotationMirrors().stream().anyMatch(annotation -> !isOverride(annotation.getAnnotationType()))
                    || executable.getKind() == ElementKind.METHOD && !overriddenBy(executable).isEmpty()
                    || isAConversionFactory(executable)
                    || isASingleValueConstructor(executable);
        }

        private boolean isAConversionFactory(ExecutableElement executable) {
            return executable.getKind() == ElementKind.METHOD && executable.getParameters().size() == 1
                    && executable.getModifiers().containsAll(Set.of(Modifier.PUBLIC, Modifier.STATIC))
                    && CONVERSION_FACTORY_NAMES.contains(executable.getSimpleName().toString());
        }

        private boolean isASingleValueConstructor(ExecutableElement executable) {
            return executable.getKind() == ElementKind.CONSTRUCTOR && executable.getParameters().size() == 1
                    && !executable.getModifiers().contains(Modifier.PRIVATE)
                    && !isThrowable(executable.getEnclosingElement().asType());
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
            boolean tracked = switch (variable.getKind()) {
                case PARAMETER, FIELD, LOCAL_VARIABLE, RESOURCE_VARIABLE -> true;
                default -> false;
            };
            if (tracked && isOpen(variable.asType()) && isImmutable(variable.asType())) {
                feedsByVariable.computeIfAbsent(variable, ignored -> new ArrayList<>()).add(value);
                if (variable.getKind() == ElementKind.FIELD && !variable.getModifiers().contains(Modifier.FINAL)) {
                    unsettledVariables.add(variable);
                }
            }
        }

        private List<Forwarding> forwardingsOf(ExecutableElement constructor, MethodTree method) {
            if (method.getBody() == null) {
                return List.of();
            }
            TreePath body = child(getCurrentPath(), method.getBody());
            for (StatementTree statement : method.getBody().getStatements()) {
                if (statement instanceof ExpressionStatementTree expression && expression.getExpression() instanceof MethodInvocationTree invocation
                        && callsAnotherConstructor(invocation)) {
                    return forwardingsOf(constructor, child(child(body, statement), invocation), new AssignedVariables().of(body));
                }
            }
            return List.of();
        }

        private List<Forwarding> forwardingsOf(ExecutableElement constructor, TreePath invocationPath, Set<Element> assigned) {
            ExecutableElement target = (ExecutableElement) trees.getElement(invocationPath);
            List<Forwarding> forwardings = new ArrayList<>();
            List<? extends ExpressionTree> arguments = ((MethodInvocationTree) invocationPath.getLeaf()).getArguments();
            for (int argument = 0; argument < arguments.size(); argument++) {
                Element named = trees.getElement(child(invocationPath, arguments.get(argument)));
                int parameter = constructor.getParameters().indexOf(named);
                if (parameter >= 0 && !assigned.contains(named)) {
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
        private final Optional<String> layer;
        private final boolean messageLayer;
        private final List<String> reports;

        private MessageSites(CompilationUnitTree unit, Optional<String> layer, boolean messageLayer, List<String> reports) {
            this.unit = unit;
            this.layer = layer;
            this.messageLayer = messageLayer;
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
            if (messageLayer && trees.getElement(getCurrentPath()) instanceof ExecutableElement method && isRequireNonNullWithAMessage(method)) {
                checkMessage("Objects.requireNonNull", child(getCurrentPath(), invocation.getArguments().get(1)), invocation.getArguments().get(1));
            }
            if (callsAnotherConstructor(invocation)) {
                ExecutableElement enclosing = enclosingConstructor();
                if (enclosing != null && isThrowable(enclosing.getEnclosingElement().asType())
                        && trees.getElement(getCurrentPath()) instanceof ExecutableElement target) {
                    checkArguments(target, invocation.getArguments(), forwardedArguments(enclosing, target));
                }
            }
            return super.visitMethodInvocation(invocation, unused);
        }

        private Set<Integer> forwardedArguments(ExecutableElement constructor, ExecutableElement target) {
            return forwardingsByConstructor.getOrDefault(constructor, List.of()).stream()
                    .filter(forwarding -> forwarding.target().equals(target))
                    .map(Forwarding::argumentIndex)
                    .collect(Collectors.toUnmodifiableSet());
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

        private void checkArguments(ExecutableElement constructor, List<? extends ExpressionTree> arguments, Set<Integer> forwarded) {
            for (int index = 0; index < arguments.size(); index++) {
                TreePath argument = child(getCurrentPath(), arguments.get(index));
                if (forwarded.contains(index)) {
                    continue;
                }
                boolean message = messageLayer
                        ? isMessageArgument(constructor, index, trees.getTypeMirror(argument))
                        : isForwardedMessageOfAMessageLayer(constructor, index);
                if (message) {
                    checkMessage(constructor.getEnclosingElement().getSimpleName().toString(), argument, arguments.get(index));
                }
            }
        }

        private void checkMessage(String target, TreePath argument, ExpressionTree expression) {
            layer.ifPresent(name -> checkedSitesByLayer.merge(name, 1, Integer::sum));
            if (carriesAnOpenValue(argument)) {
                reports.add(siteName() + " builds the message of " + target + " from an open value: " + expression + " (" + locationOfSite() + ")");
            }
        }

        private boolean isRequireNonNullWithAMessage(ExecutableElement method) {
            return method.getSimpleName().contentEquals("requireNonNull") && method.getParameters().size() == 2
                    && ((TypeElement) method.getEnclosingElement()).getQualifiedName().contentEquals("java.util.Objects");
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

package cz.novanadeje.app.shared.interfaces.rest;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.lang.classfile.Attributes;
import java.lang.classfile.ClassFile;
import java.lang.classfile.ClassModel;
import java.lang.classfile.CodeElement;
import java.lang.classfile.Instruction;
import java.lang.classfile.Label;
import java.lang.classfile.MethodModel;
import java.lang.classfile.Opcode;
import java.lang.classfile.instruction.ArrayLoadInstruction;
import java.lang.classfile.instruction.ArrayStoreInstruction;
import java.lang.classfile.instruction.BranchInstruction;
import java.lang.classfile.instruction.ConstantInstruction;
import java.lang.classfile.instruction.ConvertInstruction;
import java.lang.classfile.instruction.ExceptionCatch;
import java.lang.classfile.instruction.FieldInstruction;
import java.lang.classfile.instruction.IncrementInstruction;
import java.lang.classfile.instruction.InvokeDynamicInstruction;
import java.lang.classfile.instruction.InvokeInstruction;
import java.lang.classfile.instruction.LabelTarget;
import java.lang.classfile.instruction.LoadInstruction;
import java.lang.classfile.instruction.LookupSwitchInstruction;
import java.lang.classfile.instruction.NewObjectInstruction;
import java.lang.classfile.instruction.NewPrimitiveArrayInstruction;
import java.lang.classfile.instruction.NewReferenceArrayInstruction;
import java.lang.classfile.instruction.OperatorInstruction;
import java.lang.classfile.instruction.StoreInstruction;
import java.lang.classfile.instruction.SwitchCase;
import java.lang.classfile.instruction.TableSwitchInstruction;
import java.lang.classfile.instruction.TypeCheckInstruction;
import java.lang.constant.ClassDesc;
import java.lang.constant.ConstantDescs;
import java.lang.constant.MethodTypeDesc;
import java.lang.reflect.AccessFlag;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.SortedSet;
import java.util.TreeSet;
import java.util.function.Predicate;

final class CodeArguments {

    private static final Set<Opcode> UNARY_OPERATORS = Set.of(Opcode.INEG, Opcode.LNEG, Opcode.FNEG, Opcode.DNEG, Opcode.ARRAYLENGTH);
    private static final ClassDesc OBJECTS = ClassDesc.of("java.util.Objects");
    private static final String REQUIRE_NON_NULL = "requireNonNull";

    private final Map<String, ClassModel> classes;
    private final Predicate<String> isFailure;
    private final String domainException;
    private final Map<String, Optional<ClassModel>> classPathModels = new HashMap<>();
    private final Map<String, Optional<Integer>> codeParameters = new HashMap<>();

    record Findings(SortedSet<String> irregularCodes, SortedSet<String> failuresForwardingACode) {
    }

    private sealed interface Argument {
    }

    private record Constant(String text) implements Argument {
    }

    private record Parameter(int index) implements Argument {
    }

    private record FieldRead(String owner) implements Argument {
    }

    private record Computed() implements Argument {
    }

    private record Unseen(String source) implements Argument {
    }

    private record Body(List<CodeElement> elements, Set<Label> jumpTargets) {
    }

    private record StackEffect(int pops, int pushes) {
    }

    private CodeArguments(Map<String, ClassModel> classes, Predicate<String> isFailure, String domainException) {
        this.classes = classes;
        this.isFailure = isFailure;
        this.domainException = domainException;
    }

    static Findings read(Map<String, ClassModel> classes, Predicate<String> isFailure, String domainException) {
        return new CodeArguments(classes, isFailure, domainException).read();
    }

    private Findings read() {
        Findings findings = new Findings(new TreeSet<>(), new TreeSet<>());
        classes.values().forEach(model -> model.methods().forEach(method -> body(method)
                .ifPresent(body -> checkFailuresBuiltIn(model, method, body, findings))));
        return findings;
    }

    private void checkFailuresBuiltIn(ClassModel model, MethodModel method, Body body, Findings findings) {
        for (int index = 0; index < body.elements().size(); index++) {
            if (body.elements().get(index) instanceof InvokeInstruction init && isConstructorCall(init) && isFailure.test(init.owner().asInternalName())) {
                checkCodeArgument(model, method, body, index, init, findings);
            }
        }
    }

    private void checkCodeArgument(ClassModel model, MethodModel method, Body body, int call, InvokeInstruction init, Findings findings) {
        Optional<Integer> codeParameter = codeParameterOf(init.owner().asInternalName(), init.typeSymbol());
        if (codeParameter.isEmpty()) {
            return;
        }
        String caller = readable(model.thisClass().asInternalName());
        switch (argument(method, body, call, init.typeSymbol(), codeParameter.get())) {
            case Constant(String text) when !ProblemTextCatalogue.isCode(text) ->
                    findings.irregularCodes().add(caller + ": " + ProblemTextCatalogue.printable(text));
            case Parameter _ when !isForwardingAllowed(model, method, body, call, init) -> findings.failuresForwardingACode().add(caller);
            case FieldRead(String owner) when !isOfTheNestOf(owner, model.thisClass().asInternalName(), init.owner().asInternalName()) ->
                    findings.irregularCodes().add(caller + ": a code read from " + readable(owner));
            case Unseen(String source) -> findings.irregularCodes().add(caller + ": a code from " + source);
            default -> {
            }
        }
    }

    private boolean isForwardingAllowed(ClassModel model, MethodModel method, Body body, int index, InvokeInstruction init) {
        boolean delegatingCall = isDelegatingCall(method, body, index, init);
        return delegatingCall && (method.flags().has(AccessFlag.PRIVATE) || model.flags().has(AccessFlag.ABSTRACT));
    }

    private Optional<Integer> codeParameterOf(String owner, MethodTypeDesc type) {
        if (owner.equals(domainException)) {
            return Optional.of(0);
        }
        String key = owner + type.descriptorString();
        if (!codeParameters.containsKey(key)) {
            codeParameters.put(key, Optional.empty());
            codeParameters.put(key, constructor(owner, type).flatMap(this::forwardedCodeParameter));
        }
        return codeParameters.get(key);
    }

    private Optional<Integer> forwardedCodeParameter(MethodModel constructor) {
        Optional<Body> body = body(constructor);
        if (body.isEmpty()) {
            return Optional.empty();
        }
        for (int index = 0; index < body.get().elements().size(); index++) {
            if (body.get().elements().get(index) instanceof InvokeInstruction init && isDelegatingCall(constructor, body.get(), index, init)) {
                Optional<Integer> targetParameter = codeParameterOf(init.owner().asInternalName(), init.typeSymbol());
                if (targetParameter.isEmpty()) {
                    return Optional.empty();
                }
                return argument(constructor, body.get(), index, init.typeSymbol(), targetParameter.get()) instanceof Parameter(int parameter)
                        ? Optional.of(parameter)
                        : Optional.empty();
            }
        }
        return Optional.empty();
    }

    private boolean isDelegatingCall(MethodModel method, Body body, int index, InvokeInstruction init) {
        return isConstructorCall(init)
                && method.methodName().equalsString(ConstantDescs.INIT_NAME)
                && producer(body, index, init.typeSymbol().parameterCount())
                .map(receiver -> body.elements().get(receiver) instanceof LoadInstruction load && load.slot() == 0)
                .orElse(false);
    }

    private Argument argument(MethodModel method, Body body, int call, MethodTypeDesc type, int parameter) {
        return producer(body, call, type.parameterCount() - 1 - parameter)
                .map(index -> argumentProducedAt(method, body, index))
                .orElse(new Unseen("a branch"));
    }

    private Argument argumentProducedAt(MethodModel method, Body body, int index) {
        return switch (body.elements().get(index)) {
            case ConstantInstruction constant when constant.constantValue() instanceof String text -> new Constant(text);
            case LoadInstruction load -> stringParameterAt(method, load.slot())
                    .<Argument>map(parameter -> isReassigned(body, load.slot()) ? new Unseen("a reassigned parameter") : new Parameter(parameter))
                    .orElse(new Unseen("a local variable"));
            case InvokeInstruction invoke when invoke.owner().asSymbol().equals(OBJECTS) && invoke.name().equalsString(REQUIRE_NON_NULL) ->
                    argument(method, body, index, invoke.typeSymbol(), 0);
            case InvokeInstruction _, InvokeDynamicInstruction _ -> new Computed();
            case FieldInstruction field -> new FieldRead(field.owner().asInternalName());
            case Instruction other -> new Unseen(other.opcode().name().toLowerCase(Locale.ROOT));
            default -> new Unseen("an unknown element");
        };
    }

    private static Optional<Integer> producer(Body body, int before, int depthFromTop) {
        int wanted = depthFromTop;
        for (int index = before - 1; index >= 0; index--) {
            CodeElement element = body.elements().get(index);
            if (element instanceof LabelTarget target && body.jumpTargets().contains(target.label())) {
                return Optional.empty();
            }
            if (!(element instanceof Instruction instruction) || instruction.opcode() == Opcode.CHECKCAST) {
                continue;
            }
            if (instruction.opcode() == Opcode.DUP) {
                wanted = wanted <= 1 ? 0 : wanted - 1;
                continue;
            }
            Optional<StackEffect> effect = stackEffect(instruction);
            if (effect.isEmpty()) {
                return Optional.empty();
            }
            if (wanted < effect.get().pushes()) {
                return Optional.of(index);
            }
            wanted += effect.get().pops() - effect.get().pushes();
        }
        return Optional.empty();
    }

    private static Optional<StackEffect> stackEffect(Instruction instruction) {
        return Optional.ofNullable(switch (instruction) {
            case LoadInstruction _, ConstantInstruction _, NewObjectInstruction _ -> new StackEffect(0, 1);
            case StoreInstruction _ -> new StackEffect(1, 0);
            case IncrementInstruction _ -> new StackEffect(0, 0);
            case TypeCheckInstruction _, ConvertInstruction _, NewReferenceArrayInstruction _, NewPrimitiveArrayInstruction _ -> new StackEffect(1, 1);
            case ArrayLoadInstruction _ -> new StackEffect(2, 1);
            case ArrayStoreInstruction _ -> new StackEffect(3, 0);
            case OperatorInstruction operator -> new StackEffect(UNARY_OPERATORS.contains(operator.opcode()) ? 1 : 2, 1);
            case FieldInstruction field -> switch (field.opcode()) {
                case GETSTATIC -> new StackEffect(0, 1);
                case GETFIELD -> new StackEffect(1, 1);
                case PUTSTATIC -> new StackEffect(1, 0);
                default -> new StackEffect(2, 0);
            };
            case InvokeInstruction invoke ->
                    new StackEffect(invoke.typeSymbol().parameterCount() + (invoke.opcode() == Opcode.INVOKESTATIC ? 0 : 1), valuesReturned(invoke.typeSymbol()));
            case InvokeDynamicInstruction dynamic -> new StackEffect(dynamic.typeSymbol().parameterCount(), valuesReturned(dynamic.typeSymbol()));
            default -> null;
        });
    }

    private static int valuesReturned(MethodTypeDesc type) {
        return type.returnType().equals(ConstantDescs.CD_void) ? 0 : 1;
    }

    private static boolean isConstructorCall(InvokeInstruction invoke) {
        return invoke.opcode() == Opcode.INVOKESPECIAL && invoke.name().equalsString(ConstantDescs.INIT_NAME);
    }

    private static Optional<Integer> stringParameterAt(MethodModel method, int slot) {
        List<ClassDesc> parameters = method.methodTypeSymbol().parameterList();
        int next = method.flags().has(AccessFlag.STATIC) ? 0 : 1;
        for (int index = 0; index < parameters.size(); index++) {
            if (next == slot) {
                return parameters.get(index).equals(ConstantDescs.CD_String) ? Optional.of(index) : Optional.empty();
            }
            next += parameters.get(index).equals(ConstantDescs.CD_long) || parameters.get(index).equals(ConstantDescs.CD_double) ? 2 : 1;
        }
        return Optional.empty();
    }

    private static boolean isReassigned(Body body, int slot) {
        return body.elements().stream().anyMatch(element -> element instanceof StoreInstruction store && store.slot() == slot);
    }

    private static Optional<Body> body(MethodModel method) {
        return method.findAttribute(Attributes.code()).map(code -> {
            List<CodeElement> elements = code.elementList();
            Set<Label> jumpTargets = new HashSet<>();
            elements.forEach(element -> {
                switch (element) {
                    case BranchInstruction branch -> jumpTargets.add(branch.target());
                    case TableSwitchInstruction table -> {
                        jumpTargets.add(table.defaultTarget());
                        table.cases().stream().map(SwitchCase::target).forEach(jumpTargets::add);
                    }
                    case LookupSwitchInstruction lookup -> {
                        jumpTargets.add(lookup.defaultTarget());
                        lookup.cases().stream().map(SwitchCase::target).forEach(jumpTargets::add);
                    }
                    case ExceptionCatch handler -> jumpTargets.add(handler.handler());
                    default -> {
                    }
                }
            });
            return new Body(elements, jumpTargets);
        });
    }

    private Optional<MethodModel> constructor(String owner, MethodTypeDesc type) {
        return model(owner).flatMap(model -> model.methods().stream()
                .filter(method -> method.methodName().equalsString(ConstantDescs.INIT_NAME) && method.methodTypeSymbol().equals(type))
                .findFirst());
    }

    private boolean isOfTheNestOf(String owner, String caller, String failure) {
        String host = nestHostOf(owner);
        return host.equals(nestHostOf(caller)) || host.equals(nestHostOf(failure));
    }

    private String nestHostOf(String internalName) {
        return model(internalName)
                .flatMap(model -> model.findAttribute(Attributes.nestHost()).map(host -> host.nestHost().asInternalName()))
                .orElse(internalName);
    }

    private Optional<ClassModel> model(String internalName) {
        return Optional.ofNullable(classes.get(internalName))
                .or(() -> classPathModels.computeIfAbsent(internalName, CodeArguments::fromClassPath));
    }

    private static Optional<ClassModel> fromClassPath(String internalName) {
        try (InputStream classFile = CodeArguments.class.getClassLoader().getResourceAsStream(internalName + ".class")) {
            return classFile == null ? Optional.empty() : Optional.of(ClassFile.of().parse(classFile.readAllBytes()));
        } catch (IOException unreadable) {
            throw new UncheckedIOException(unreadable);
        }
    }

    private static String readable(String internalName) {
        return internalName.replace('/', '.');
    }
}
